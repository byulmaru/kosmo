import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { createFedifyQueueRuntime, readFedifyRuntimeConfig } from './queue';

const queueDatabaseUrl = process.env.FEDIFY_QUEUE_DATABASE_URL;
const queueDatabasePassword = process.env.FEDIFY_QUEUE_DATABASE_PASSWORD;
const hasQueueCredential = (() => {
  if (!queueDatabaseUrl) {
    return false;
  }
  try {
    return Boolean(new URL(queueDatabaseUrl).password || queueDatabasePassword);
  } catch {
    return false;
  }
})();

describe('Fedify PostgreSQL message queue adapter', { skip: !hasQueueCredential }, () => {
  test('implicitly initializes, reports depth, and consumes after abort', async () => {
    const config = readFedifyRuntimeConfig({
      FEDIFY_RUNTIME_MODE: 'producer',
      FEDIFY_QUEUE_DATABASE_PASSWORD: queueDatabasePassword,
      FEDIFY_QUEUE_DATABASE_URL: queueDatabaseUrl,
    });
    const runtime = createFedifyQueueRuntime(config);
    assert.ok(runtime.queue);
    assert.ok(runtime.sql);

    const controller = new AbortController();
    const messageId = randomUUID();
    let consumed: unknown;
    let resolveConsumed: (() => void) | undefined;
    const consumedPromise = new Promise<void>((resolve) => {
      resolveConsumed = resolve;
    });

    try {
      // Do not call queue.initialize(): the official adapter owns its lazy
      // table/index initialization.  Consumer readiness uses this same
      // getDepth path even when no producer has initialized the database yet.
      const initial = await runtime.queue.getDepth();
      assert.equal(initial.queued, 0);
      assert.equal(initial.ready, 0);
      assert.equal(initial.delayed, 0);

      await runtime.queue.enqueue({ messageId });
      const queued = await runtime.queue.getDepth();
      assert.equal(queued.queued, 1);
      assert.equal(queued.ready, 1);
      assert.equal(queued.delayed, 0);

      const listener = runtime.queue.listen(
        async (message) => {
          consumed = message;
          resolveConsumed?.();
          controller.abort();
        },
        { signal: controller.signal },
      );
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          consumedPromise,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('Fedify queue listener timed out.')),
              10_000,
            );
          }),
        ]);
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
      }
      await listener;

      assert.deepEqual(consumed, { messageId });
      const empty = await runtime.queue.getDepth();
      assert.equal(empty.queued, 0);
      assert.equal(empty.ready, 0);
      assert.equal(empty.delayed, 0);
    } finally {
      controller.abort();
      await runtime.sql.end({ timeout: 5 });
    }
  });
});
