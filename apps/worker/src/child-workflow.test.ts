import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type { ChildWorkflowInput, ChildWorkflowResult } from './test-fixtures/child-workflow';

const workflowsPath = new URL('./test-fixtures/child-workflow.ts', import.meta.url).pathname;

type ChildWorkflow = (input: ChildWorkflowInput) => Promise<ChildWorkflowResult>;
type StartParentWorkflow = (input: ChildWorkflowInput) => Promise<string>;

const createWorker = async (environment: TestWorkflowEnvironment, taskQueue: string) =>
  Worker.create({
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    taskQueue,
    workflowsPath,
  });

test(
  'runChildWorkflow execute mode forwards args and returns the child result',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-child-execute-${process.pid}`;
    const worker = await createWorker(environment, taskQueue);

    await worker.runUntil(async () => {
      const input = { id: `execute-${process.pid}` };
      const result = await environment.client.workflow.execute<ChildWorkflow>(
        'executeChildWorkflow',
        {
          args: [input],
          taskQueue,
          workflowId: `${taskQueue}:parent`,
        },
      );

      assert.deepEqual(result, {
        childWorkflowId: `child:${input.id}`,
        input,
        parentMessage: null,
        completionMessage: null,
      });
    });
  },
);

test(
  'runChildWorkflow start mode preserves an abandoned child for native handle signaling',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-child-start-${process.pid}`;
    const worker = await createWorker(environment, taskQueue);

    await worker.runUntil(async () => {
      const input = { id: `start-${process.pid}`, waitForCompletion: true };
      const childWorkflowId = await environment.client.workflow.execute<StartParentWorkflow>(
        'startChildWorkflow',
        {
          args: [input],
          taskQueue,
          workflowId: `${taskQueue}:parent`,
        },
      );
      const childHandle = environment.client.workflow.getHandle<ChildWorkflow>(childWorkflowId);

      assert.equal((await childHandle.describe()).status.name, 'RUNNING');
      await childHandle.signal('completionSignal', 'from-client');

      const result = await childHandle.result();
      assert.deepEqual(result, {
        childWorkflowId,
        input,
        parentMessage: 'from-parent',
        completionMessage: 'from-client',
      });
    });
  },
);

test(
  'runChildWorkflow execute mode propagates a child Workflow failure',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-child-failure-${process.pid}`;
    const worker = await createWorker(environment, taskQueue);

    await worker.runUntil(async () => {
      const input = { id: `failure-${process.pid}`, fail: true };
      await assert.rejects(
        environment.client.workflow.execute('executeChildWorkflow', {
          args: [input],
          taskQueue,
          workflowId: `${taskQueue}:parent`,
        }),
        (error: unknown) => {
          const messages: string[] = [];
          let current: unknown = error;
          while (current instanceof Error) {
            messages.push(current.message);
            current = 'cause' in current ? current.cause : undefined;
          }
          assert.ok(messages.includes(`child failure: ${input.id}`), messages.join(' -> '));
          return true;
        },
      );
    });
  },
);
