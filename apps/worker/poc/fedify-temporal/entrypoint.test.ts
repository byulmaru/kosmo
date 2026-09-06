import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { NativeConnection, Worker as TemporalWorker } from '@temporalio/worker';
import { runFedifyTemporalPoc } from './entrypoint';

const entrypointPath = new URL('./entrypoint.ts', import.meta.url).pathname;

test(
  'PoC entrypoint가 실제 Worker를 시작하고 SIGTERM 뒤에 정상 종료한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `fedify-temporal-entrypoint-${process.pid}-${crypto.randomUUID()}`;
    const namespace = environment.namespace ?? 'default';
    const child = spawn(process.execPath, ['--import', 'tsx', entrypointPath], {
      cwd: new URL('../..', import.meta.url).pathname,
      env: {
        ...process.env,
        TEMPORAL_ADDRESS: environment.address,
        TEMPORAL_NAMESPACE: namespace,
        TEMPORAL_TASK_QUEUE: taskQueue,
        PUBLIC_ORIGIN: 'https://local.example',
        FEDIFY_TEMPORAL_DEMO: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    let resolveDemo!: (event: Record<string, unknown>) => void;
    let rejectDemo!: (error: Error) => void;
    const demoEvent = new Promise<Record<string, unknown>>((resolve, reject) => {
      resolveDemo = resolve;
      rejectDemo = reject;
    });
    let stdoutBuffer = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout.push(text);
      stdoutBuffer += text;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.event === 'fedify-temporal-demo-follow') {
            resolveDemo(event);
          }
        } catch {
          // Worker and Node diagnostics share stdout; only the JSON demo event
          // is relevant to this assertion.
        }
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
    child.once('error', (error) => rejectDemo(error));
    child.once('exit', (code, signal) => {
      rejectDemo(
        new Error(
          `PoC entrypoint exited before the demo event: code=${code} signal=${signal} stdout=${stdout.join('')} stderr=${stderr.join('')}`,
        ),
      );
    });
    t.after(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    });

    // A real Workflow task is the readiness probe: it remains queued until
    // the child has created its Worker with the PoC workflow bundle.
    const readyHandle = await environment.client.workflow.start('fedifyMessageWorkflow', {
      args: [{ id: 'entrypoint-ready', message: {}, availableAt: Date.now() }],
      taskQueue,
      workflowId: `fedify-entrypoint-ready-${crypto.randomUUID()}`,
    });
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        readyHandle.result(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  `Timed out waiting for PoC Worker. stdout=${stdout.join('')} stderr=${stderr.join('')}`,
                ),
              ),
            15_000,
          );
        }),
      ]);
    } catch (error) {
      await readyHandle.terminate('entrypoint readiness probe timed out').catch(() => undefined);
      throw error;
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }

    let demoTimeout: NodeJS.Timeout | undefined;
    const demoEventPayload = await Promise.race([
      demoEvent,
      new Promise<never>((_, reject) => {
        demoTimeout = setTimeout(
          () =>
            reject(
              new Error(
                `Timed out waiting for PoC demo event. stdout=${stdout.join('')} stderr=${stderr.join('')}`,
              ),
            ),
          15_000,
        );
      }),
    ]);
    if (demoTimeout !== undefined) {
      clearTimeout(demoTimeout);
    }
    assert.equal(demoEventPayload.event, 'fedify-temporal-demo-follow');
    assert.equal(demoEventPayload.recipient, 'local');
    assert.match(String(demoEventPayload.activityId), /^https:\/\/remote\.example\/activities\//);

    child.kill('SIGTERM');
    const [code, signal] = await once(child, 'exit');
    assert.equal(code, 0);
    assert.equal(signal, null);
  },
);

test(
  'Worker.create 완료 직전 SIGTERM도 Worker와 NativeConnection을 정상 종료한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `fedify-temporal-entrypoint-race-${process.pid}-${crypto.randomUUID()}`;
    const originalCreate = TemporalWorker.create;
    const originalConnect = NativeConnection.connect;
    let signalInjected = false;
    let connectionClosed = false;
    const previousTemporalEnvironment = {
      TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
      TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE,
      TEMPORAL_TASK_QUEUE: process.env.TEMPORAL_TASK_QUEUE,
    };
    const runtimeEnvironment = {
      TEMPORAL_ADDRESS: environment.address,
      TEMPORAL_NAMESPACE: environment.namespace ?? 'default',
      TEMPORAL_TASK_QUEUE: taskQueue,
    };

    TemporalWorker.create = async (options) => {
      const worker = await originalCreate.call(TemporalWorker, options);
      signalInjected = true;
      process.emit('SIGTERM');
      return worker;
    };
    NativeConnection.connect = async (...args) => {
      const connection = await originalConnect.call(NativeConnection, ...args);
      const close = connection.close.bind(connection);
      connection.close = async () => {
        connectionClosed = true;
        await close();
      };
      return connection;
    };

    Object.assign(process.env, runtimeEnvironment);
    try {
      await runFedifyTemporalPoc(runtimeEnvironment);
    } finally {
      TemporalWorker.create = originalCreate;
      NativeConnection.connect = originalConnect;
      for (const [name, value] of Object.entries(previousTemporalEnvironment)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }

    assert.equal(signalInjected, true);
    assert.equal(connectionClosed, true);
  },
);
