import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { healthStatus, runWorker } from './worker';
import type { AddressInfo, Socket } from 'node:net';

if (process.env.WORKER_IDLE_SIGNAL_TEST === '1') {
  void runWorker(undefined, process.env);
} else if (process.env.WORKER_STARTUP_SIGNAL_TEST === '1') {
  setTimeout(() => process.exit(99), 3_000);
  void runWorker({ activities: { example: () => undefined }, taskQueue: 'test' }, process.env);
} else {
  test('business handler가 없으면 외부 연결 전에 실패한다', async () => {
    await assert.rejects(runWorker({ taskQueue: 'reserved-but-empty' }, {}), /No business Worker/);
    await assert.rejects(
      runWorker({ activities: { example: () => undefined }, taskQueue: ' ' }, {}),
      /No business Worker/,
    );
    await assert.rejects(
      runWorker({ taskQueue: 'test', workflowsPath: ' ' }, {}),
      /No business Worker/,
    );
    await assert.rejects(
      runWorker(
        {
          activities: { example: undefined as never },
          taskQueue: 'test',
        },
        {},
      ),
      /No business Worker/,
    );
  });

  test('Temporal environment를 검증한다', async () => {
    const registration = {
      activities: { example: () => undefined },
      taskQueue: 'test',
    };

    await assert.rejects(runWorker(registration, {}), /TEMPORAL_ADDRESS/);
    await assert.rejects(
      runWorker(registration, { TEMPORAL_ADDRESS: 'temporal.test:7233' }),
      /TEMPORAL_NAMESPACE/,
    );
    await assert.rejects(
      runWorker(registration, {
        PORT: '0',
        TEMPORAL_ADDRESS: 'temporal.test:7233',
        TEMPORAL_NAMESPACE: 'kosmo-test',
      }),
      /PORT must be an integer/,
    );
  });

  test('SDK Worker 상태를 health 응답에 그대로 반영한다', () => {
    assert.equal(healthStatus('/health'), 200);
    assert.equal(healthStatus('/ready', 'INITIALIZED'), 503);
    assert.equal(healthStatus('/ready', 'RUNNING'), 200);
    assert.equal(healthStatus('/ready', 'STOPPING'), 503);
    assert.equal(healthStatus('/ready', undefined, true), 200);
    assert.equal(healthStatus('/unknown', 'RUNNING'), 404);
  });

  test(
    'registration이 없으면 Temporal 환경 없이 idle health/readiness를 제공하고 graceful shutdown한다',
    { timeout: 5_000 },
    async (t) => {
      const healthPortReservation = createServer();
      healthPortReservation.listen(0, '127.0.0.1');
      await once(healthPortReservation, 'listening');
      const healthPort = (healthPortReservation.address() as AddressInfo).port;
      await healthPortReservation[Symbol.asyncDispose]();

      const childEnvironment = { ...process.env };
      delete childEnvironment.TEMPORAL_ADDRESS;
      delete childEnvironment.TEMPORAL_NAMESPACE;
      const child = spawn(process.execPath, ['--import', 'tsx', import.meta.filename], {
        cwd: import.meta.dirname,
        env: {
          ...childEnvironment,
          HOST: '127.0.0.1',
          PORT: String(healthPort),
          WORKER_IDLE_SIGNAL_TEST: '1',
        },
      });
      t.after(() => child.kill('SIGKILL'));

      const deadline = Date.now() + 3_000;
      let healthResponse: Response | undefined;
      let readyResponse: Response | undefined;
      while (Date.now() < deadline) {
        try {
          [healthResponse, readyResponse] = await Promise.all([
            fetch(`http://127.0.0.1:${healthPort}/health`),
            fetch(`http://127.0.0.1:${healthPort}/ready`),
          ]);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }

      assert.equal(healthResponse?.status, 200);
      assert.equal(readyResponse?.status, 200);
      child.kill('SIGTERM');
      const [code, signal] = await once(child, 'exit');
      assert.equal(signal, null);
      assert.equal(code, 0);
    },
  );

  test('Temporal connect 중 SIGTERM을 process 종료로 전달한다', { timeout: 5_000 }, async (t) => {
    const temporal = createServer();
    const sockets = new Set<Socket>();
    temporal.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    temporal.listen(0, '127.0.0.1');
    await once(temporal, 'listening');
    t.after(() => {
      for (const socket of sockets) {
        socket.destroy();
      }
      return temporal[Symbol.asyncDispose]();
    });

    const healthPortReservation = createServer();
    healthPortReservation.listen(0, '127.0.0.1');
    await once(healthPortReservation, 'listening');
    const healthPort = (healthPortReservation.address() as AddressInfo).port;
    await healthPortReservation[Symbol.asyncDispose]();

    const temporalPort = (temporal.address() as AddressInfo).port;
    const child = spawn(process.execPath, ['--import', 'tsx', import.meta.filename], {
      cwd: import.meta.dirname,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(healthPort),
        TEMPORAL_ADDRESS: `127.0.0.1:${temporalPort}`,
        TEMPORAL_NAMESPACE: 'test',
        WORKER_STARTUP_SIGNAL_TEST: '1',
      },
    });
    t.after(() => child.kill('SIGKILL'));

    await once(temporal, 'connection');
    child.kill('SIGTERM');
    const [code, signal] = await once(child, 'exit');

    assert.equal(code, null);
    assert.equal(signal, 'SIGTERM');
  });
}
