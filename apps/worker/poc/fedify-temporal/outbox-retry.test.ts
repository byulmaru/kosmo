import assert from 'node:assert/strict';
import test from 'node:test';
import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { TemporalFedifyQueue } from './queue';
import { createFedifyTemporalWorker } from './worker';
import type { TestContext } from 'node:test';
import type { MessageQueueEnqueueOptions } from '@fedify/fedify';

const workflowsPath = new URL('./workflows.ts', import.meta.url).pathname;

type OutboxMessageOverrides = Readonly<{
  readonly activityId?: string;
  readonly attempt?: number;
  readonly circuitHeld?: boolean;
  readonly circuitHeldSince?: string;
  readonly orderingKey?: string;
}>;

type RecordedEnqueue = Readonly<{
  readonly message: unknown;
  readonly options: MessageQueueEnqueueOptions;
}>;

class RecordingTemporalFedifyQueue extends TemporalFedifyQueue {
  readonly enqueues: RecordedEnqueue[] = [];

  override async enqueue(
    message: unknown,
    options: MessageQueueEnqueueOptions = {},
  ): Promise<void> {
    this.enqueues.push({ message, options });
    await super.enqueue(message, options);
  }
}

const waitFor = async (
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const createOutboxMessage = (inbox: string, overrides: OutboxMessageOverrides = {}) => {
  const activityId = overrides.activityId ?? 'https://example.com/activity/temporal-retry';

  return {
    type: 'outbox' as const,
    id: crypto.randomUUID(),
    baseUrl: 'https://example.com',
    keys: [],
    activity: {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Create',
      id: activityId,
      actor: 'https://example.com/users/alice',
      object: { type: 'Note', content: 'Temporal outbox retry test' },
    },
    activityId,
    activityType: 'https://www.w3.org/ns/activitystreams#Create',
    inbox,
    sharedInbox: false,
    actorIds: ['https://example.com/users/alice'],
    started: new Date().toISOString(),
    attempt: 0,
    headers: {},
    traceContext: {},
    orderingKey: overrides.orderingKey,
    ...overrides,
  };
};

const messageActivityId = (message: unknown): string => {
  assert.ok(message != null && typeof message === 'object');
  const activity = (message as { readonly activity?: unknown }).activity;
  assert.ok(activity != null && typeof activity === 'object');
  const id = (activity as { readonly id?: unknown }).id;
  if (typeof id !== 'string') {
    throw new Error('Outbox activity id is missing');
  }
  return id;
};

const createOutboxFederation = (
  queue: TemporalFedifyQueue,
  kv: MemoryKvStore,
  options: Readonly<{
    readonly circuitBreaker?:
      | false
      | {
          readonly failureThreshold: number;
          readonly failureWindow: Temporal.DurationLike;
          readonly recoveryDelay: Temporal.DurationLike;
          readonly heldActivityTtl: Temporal.DurationLike;
        };
  }>,
) =>
  createFederation<void>({
    kv,
    queue: { outbox: queue },
    manuallyStartQueue: true,
    origin: 'https://example.com',
    outboxRetryPolicy: () => Temporal.Duration.from({ milliseconds: 1 }),
    ...options,
  });

const readCircuitState = async (
  kv: MemoryKvStore,
): Promise<{ readonly state?: string } | undefined> =>
  (await kv.get(['_fedify', 'circuit', 'breaker.example'])) as
    | { readonly state?: string }
    | undefined;

const createRuntime = async (
  t: TestContext,
  options: Parameters<typeof createOutboxFederation>[2],
) => {
  const environment = await TestWorkflowEnvironment.createLocal({
    server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
  });
  t.after(() => environment.teardown());

  const taskQueue = `fedify-temporal-outbox-${process.pid}-${crypto.randomUUID()}`;
  const queue = new RecordingTemporalFedifyQueue(environment.client, taskQueue);
  const kv = new MemoryKvStore();
  const federation = createOutboxFederation(queue, kv, options);
  const abortController = new AbortController();
  const queueRun = federation.startQueue(undefined, {
    queue: 'outbox',
    signal: abortController.signal,
  });
  await queue.listening;

  const worker = await createFedifyTemporalWorker({
    connection: environment.nativeConnection,
    namespace: environment.namespace ?? 'default',
    queue,
    taskQueue,
    workflowsPath,
  });

  return {
    environment,
    federation,
    kv,
    queue,
    queueRun,
    taskQueue,
    worker,
    stop: async () => {
      abortController.abort();
      await queueRun;
    },
  };
};

test(
  'Temporal outbox adapter는 Retry-After 응답 뒤 Fedify 재시도를 실행한다',
  { timeout: 120_000 },
  async (t) => {
    const orderingKey = 'https://example.com/object/rate';
    const firstActivityId = 'https://example.com/activity/rate-first';
    const successorActivityId = 'https://example.com/activity/rate-successor';
    const requestActivityIds: string[] = [];
    const attemptsByActivity = new Map<string, number>();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const activity = JSON.parse(await request.clone().text()) as { readonly id?: unknown };
      const activityId = activity.id;
      if (typeof activityId !== 'string') {
        throw new Error('Outbox activity id is missing');
      }
      requestActivityIds.push(activityId);
      const attempt = (attemptsByActivity.get(activityId) ?? 0) + 1;
      attemptsByActivity.set(activityId, attempt);
      if (activityId === firstActivityId && attempt === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': '1' },
        });
      }
      return new Response('', { status: 202 });
    };
    t.after(() => {
      globalThis.fetch = originalFetch;
    });

    const runtime = await createRuntime(t, { circuitBreaker: false });
    t.after(runtime.stop);

    await runtime.worker.runUntil(async () => {
      await runtime.queue.enqueue(
        createOutboxMessage('https://rate.example/inbox', {
          activityId: firstActivityId,
          orderingKey,
        }),
        { orderingKey },
      );
      await waitFor(() => runtime.queue.enqueues.length >= 2);
      const retry = runtime.queue.enqueues[1];
      assert.equal(messageActivityId(retry?.message), firstActivityId);
      assert.equal((retry?.message as { readonly attempt?: number }).attempt, 1);
      assert.equal((retry?.message as { readonly orderingKey?: string }).orderingKey, orderingKey);
      assert.equal(retry?.options.orderingKey, orderingKey);
      assert.equal(retry?.options.delay?.total({ unit: 'seconds' }), 1);

      await runtime.queue.enqueue(
        createOutboxMessage('https://rate.example/inbox', {
          activityId: successorActivityId,
          orderingKey,
        }),
        { orderingKey },
      );
      await waitFor(() => requestActivityIds.length >= 3);
    });

    assert.deepEqual(requestActivityIds, [firstActivityId, successorActivityId, firstActivityId]);
  },
);

test(
  'Temporal outbox adapter는 circuit breaker hold를 재큐잉하고 recovery probe를 실행한다',
  { timeout: 120_000 },
  async (t) => {
    const orderingKey = 'https://example.com/object/breaker';
    const activityId = 'https://example.com/activity/breaker';
    const requestActivityIds: string[] = [];
    let requests = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const activity = JSON.parse(await request.clone().text()) as { readonly id?: unknown };
      const requestActivityId = activity.id;
      if (typeof requestActivityId !== 'string') {
        throw new Error('Outbox activity id is missing');
      }
      requestActivityIds.push(requestActivityId);
      requests += 1;
      return requests === 1
        ? new Response('temporarily unavailable', { status: 503 })
        : new Response('', { status: 202 });
    };
    t.after(() => {
      globalThis.fetch = originalFetch;
    });

    const runtime = await createRuntime(t, {
      circuitBreaker: {
        failureThreshold: 1,
        failureWindow: { seconds: 10 },
        recoveryDelay: { milliseconds: 100 },
        heldActivityTtl: { seconds: 10 },
      },
    });
    t.after(runtime.stop);

    await runtime.worker.runUntil(async () => {
      await runtime.queue.enqueue(
        createOutboxMessage('https://breaker.example/inbox', {
          activityId,
          orderingKey,
        }),
        { orderingKey },
      );
      await waitFor(() => requests >= 1);
      await waitFor(async () => (await readCircuitState(runtime.kv))?.state === 'open');
      assert.equal((await readCircuitState(runtime.kv))?.state, 'open');
      await waitFor(() => runtime.queue.enqueues.length >= 2);
      const held = runtime.queue.enqueues[1];
      assert.equal(messageActivityId(held?.message), activityId);
      assert.equal((held?.message as { readonly attempt?: number }).attempt, 0);
      assert.equal((held?.message as { readonly circuitHeld?: boolean }).circuitHeld, true);
      assert.equal((held?.message as { readonly orderingKey?: string }).orderingKey, orderingKey);
      assert.equal(held?.options.orderingKey, orderingKey);
      const holdDelayMs = held?.options.delay?.total({ unit: 'milliseconds' });
      assert.ok(holdDelayMs != null && holdDelayMs > 0 && holdDelayMs <= 100);
      await waitFor(() => requests >= 2);
    });

    assert.equal(requests, 2);
    assert.deepEqual(requestActivityIds, [activityId, activityId]);
    assert.equal(await readCircuitState(runtime.kv), undefined);
  },
);
