import assert from 'node:assert/strict';
import test from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { TemporalFedifyQueue } from './queue';
import { createFedifyTemporalWorker } from './worker';
import type { TestContext } from 'node:test';
import type { WorkflowExecutionInfo, WorkflowHandle } from '@temporalio/client';

const workflowsPath = new URL('./workflows.ts', import.meta.url).pathname;

type Deferred<T> = Readonly<{
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
}>;

const deferred = <T = void>(): Deferred<T> => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

type Runtime = Readonly<{
  readonly environment: TestWorkflowEnvironment;
  readonly queue: TemporalFedifyQueue;
  readonly taskQueue: string;
  readonly worker: Awaited<ReturnType<typeof createFedifyTemporalWorker>>;
  readonly stopListening: () => Promise<void>;
}>;

const createRuntime = async (
  t: TestContext,
  handler: (message: unknown) => Promise<void> | void,
): Promise<Runtime> => {
  const environment = await TestWorkflowEnvironment.createLocal({
    server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
  });
  t.after(() => environment.teardown());

  const taskQueue = `fedify-temporal-contract-${process.pid}-${crypto.randomUUID()}`;
  const queue = new TemporalFedifyQueue(environment.client, taskQueue);
  const controller = new AbortController();
  const listening = queue.listen(handler, { signal: controller.signal });
  const worker = await createFedifyTemporalWorker({
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    queue,
    taskQueue,
    workflowsPath,
  });

  return {
    environment,
    queue,
    taskQueue,
    worker,
    stopListening: async () => {
      controller.abort();
      await listening;
    },
  };
};

const messageId = (message: unknown): string => {
  assert.ok(message != null && typeof message === 'object');
  const id = (message as { readonly id?: unknown }).id;
  assert.equal(typeof id, 'string');
  return id;
};

type WorkflowHistory = Awaited<ReturnType<WorkflowHandle['fetchHistory']>>;

const waitForKeyedExecutions = async (
  runtime: Runtime,
  predicate: (executions: WorkflowExecutionInfo[]) => boolean = (executions) =>
    executions.length >= 2,
): Promise<WorkflowExecutionInfo[]> => {
  const deadline = Date.now() + 10_000;
  let executions: WorkflowExecutionInfo[] = [];
  while (Date.now() < deadline) {
    executions = [];
    for await (const execution of runtime.environment.client.workflow.list()) {
      if (
        execution.taskQueue === runtime.taskQueue &&
        execution.type === 'fedifyKeyedMessageWorkflow'
      ) {
        executions.push(execution);
      }
    }
    if (predicate(executions)) {
      return executions;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return executions;
};

test('같은 ordering key의 준비된 메시지는 FIFO로 처리한다', { timeout: 120_000 }, async (t) => {
  const processed: string[] = [];
  const firstStarted = deferred<void>();
  const releaseFirst = deferred<void>();
  const secondStarted = deferred<void>();
  const firstDone = deferred<void>();
  const runtime = await createRuntime(t, async (message) => {
    const id = messageId(message);
    processed.push(id);
    if (id === 'first') {
      firstStarted.resolve();
      await releaseFirst.promise;
      firstDone.resolve();
    } else {
      secondStarted.resolve();
    }
  });

  await runtime.worker.runUntil(async () => {
    await runtime.queue.enqueue({ id: 'first' }, { orderingKey: 'same-key' });
    await firstStarted.promise;
    await runtime.queue.enqueue({ id: 'second' }, { orderingKey: 'same-key' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(processed, ['first']);
    releaseFirst.resolve();
    await firstDone.promise;
    await secondStarted.promise;
  });
  await runtime.stopListening();

  assert.deepEqual(processed, ['first', 'second']);
});

test(
  '같은 ordering key에서 지연된 메시지가 뒤의 준비된 메시지를 막지 않는다',
  { timeout: 120_000 },
  async (t) => {
    const processed: string[] = [];
    const done = deferred<void>();
    const runtime = await createRuntime(t, async (message) => {
      processed.push(messageId(message));
      if (processed.length === 2) {
        done.resolve();
      }
    });

    await runtime.worker.runUntil(async () => {
      await runtime.queue.enqueue(
        { id: 'delayed' },
        {
          delay: Temporal.Duration.from({ milliseconds: 120 }),
          orderingKey: 'same-key',
        },
      );
      await runtime.queue.enqueue({ id: 'ready' }, { orderingKey: 'same-key' });
      await done.promise;
    });
    await runtime.stopListening();

    assert.deepEqual(processed, ['ready', 'delayed']);
  },
);

test(
  '서로 다른 ordering key는 한 key의 Activity가 대기 중이어도 병렬 진행한다',
  { timeout: 120_000 },
  async (t) => {
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const firstDone = deferred<void>();
    const secondDone = deferred<void>();
    const events: string[] = [];
    const runtime = await createRuntime(t, async (message) => {
      const id = messageId(message);
      if (id === 'first') {
        events.push('first-start');
        firstStarted.resolve();
        await releaseFirst.promise;
        events.push('first-done');
        firstDone.resolve();
        return;
      }
      events.push(id);
      secondDone.resolve();
    });

    await runtime.worker.runUntil(async () => {
      await runtime.queue.enqueue({ id: 'first' }, { orderingKey: 'key-a' });
      await firstStarted.promise;
      await runtime.queue.enqueue({ id: 'second' }, { orderingKey: 'key-b' });
      await secondDone.promise;
      assert.deepEqual(events, ['first-start', 'second']);
      releaseFirst.resolve();
      await firstDone.promise;
    });
    await runtime.stopListening();
  },
);

test(
  'Activity retry가 소진된 같은 key의 메시지도 후속 메시지를 계속 처리한다',
  { timeout: 120_000 },
  async (t) => {
    let failedAttempts = 0;
    const events: string[] = [];
    const nextDone = deferred<void>();
    const runtime = await createRuntime(t, async (message) => {
      const id = messageId(message);
      if (id === 'failed') {
        failedAttempts += 1;
        events.push(`failed-${failedAttempts}`);
        throw new Error('terminal test failure');
      }
      events.push(id);
      nextDone.resolve();
    });

    await runtime.worker.runUntil(async () => {
      await runtime.queue.enqueue({ id: 'failed' }, { orderingKey: 'same-key' });
      await runtime.queue.enqueue({ id: 'next' }, { orderingKey: 'same-key' });
      await nextDone.promise;
    });
    await runtime.stopListening();

    assert.equal(failedAttempts, 3);
    assert.deepEqual(events, ['failed-1', 'failed-2', 'failed-3', 'next']);
  },
);

test(
  'Worker를 중지한 뒤에도 이미 수락된 delayed Workflow를 다시 시작한 Worker가 처리한다',
  { timeout: 120_000 },
  async (t) => {
    const processed = deferred<void>();
    let processedBeforeRestart = false;
    const runtime = await createRuntime(t, async (message) => {
      assert.equal(messageId(message), 'survives-worker-stop');
      processedBeforeRestart = true;
      processed.resolve();
    });

    await runtime.worker.runUntil(async () => {
      await runtime.queue.enqueue(
        { id: 'survives-worker-stop' },
        { delay: Temporal.Duration.from({ seconds: 5 }) },
      );
    });
    assert.equal(processedBeforeRestart, false);

    const restartedWorker = await createFedifyTemporalWorker({
      connection: runtime.environment.nativeConnection,
      namespace: runtime.environment.namespace,
      queue: runtime.queue,
      taskQueue: runtime.taskQueue,
      workflowsPath,
    });
    await restartedWorker.runUntil(async () => {
      await processed.promise;
    });
    await runtime.stopListening();
  },
);

test(
  'Continue-As-New 경계 이후에도 이미 수락된 pending 메시지를 모두 처리한다',
  { timeout: 180_000 },
  async (t) => {
    const count = 105;
    const processed: string[] = [];
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const allProcessed = deferred<void>();
    let executions: WorkflowExecutionInfo[] | undefined;
    let continuedHistory: WorkflowHistory | undefined;
    let completedHistory: WorkflowHistory | undefined;
    const runtime = await createRuntime(t, async (message) => {
      const id = messageId(message);
      if (id === 'message-0') {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      processed.push(id);
      if (processed.length === count) {
        allProcessed.resolve();
      }
    });

    await runtime.worker.runUntil(async () => {
      await runtime.queue.enqueue({ id: 'message-0' }, { orderingKey: 'continue-key' });
      await firstStarted.promise;
      for (let index = 1; index < count; index += 1) {
        await runtime.queue.enqueue({ id: `message-${index}` }, { orderingKey: 'continue-key' });
      }
      releaseFirst.resolve();
      await allProcessed.promise;

      // The final Activity resolves allProcessed before its enclosing
      // Workflow Task completes. Keep this Worker alive while visibility and
      // history observe the Continue-As-New boundary.
      executions = await waitForKeyedExecutions(runtime);
      const continuedExecution = executions.find(
        ({ status }) => status.name === 'CONTINUED_AS_NEW',
      );
      const currentExecution = executions.find(({ status }) => status.name !== 'CONTINUED_AS_NEW');
      assert.ok(continuedExecution);
      assert.ok(currentExecution);

      continuedHistory = await runtime.environment.client.workflow
        .getHandle(continuedExecution.workflowId, continuedExecution.runId)
        .fetchHistory();
      const continuedAsNewEvent = continuedHistory.events?.find(
        ({ workflowExecutionContinuedAsNewEventAttributes }) =>
          workflowExecutionContinuedAsNewEventAttributes !== undefined &&
          workflowExecutionContinuedAsNewEventAttributes !== null,
      );
      assert.ok(continuedAsNewEvent);
      assert.equal(
        continuedAsNewEvent.workflowExecutionContinuedAsNewEventAttributes?.newExecutionRunId,
        currentExecution.runId,
      );

      await runtime.environment.client.workflow
        .getHandle(currentExecution.workflowId, currentExecution.runId)
        .result();
      executions = await waitForKeyedExecutions(runtime, (values) =>
        values.some(({ status }) => status.name === 'COMPLETED'),
      );
      const completedExecution = executions.find(({ status }) => status.name === 'COMPLETED');
      assert.ok(completedExecution);
      completedHistory = await runtime.environment.client.workflow
        .getHandle(completedExecution.workflowId, completedExecution.runId)
        .fetchHistory();
    });
    await runtime.stopListening();

    assert.equal(processed.length, count);
    assert.equal(new Set(processed).size, count);
    assert.equal(processed[0], 'message-0');
    assert.ok(executions);
    assert.ok(continuedHistory);
    assert.ok(completedHistory);
    const startedEvent = completedHistory.events?.find(
      ({ workflowExecutionStartedEventAttributes }) =>
        workflowExecutionStartedEventAttributes !== undefined &&
        workflowExecutionStartedEventAttributes !== null,
    );
    assert.ok(startedEvent);
    assert.equal(
      startedEvent.workflowExecutionStartedEventAttributes?.continuedExecutionRunId,
      executions.find(({ status }) => status.name === 'CONTINUED_AS_NEW')?.runId,
    );
  },
);
