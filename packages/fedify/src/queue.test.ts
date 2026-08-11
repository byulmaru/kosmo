import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgresMessageQueue } from '@fedify/postgres';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

describe('Fedify PostgreSQL message queue', { skip: !databaseUrl }, () => {
  test('consumes an accepted message after reconnecting', async () => {
    const message = { messageId: randomUUID() };
    const producerSql = postgres(databaseUrl!);
    await new PostgresMessageQueue(producerSql).enqueue(message);
    await producerSql.end({ timeout: 5 });

    const consumerSql = postgres(databaseUrl!);
    const consumerQueue = new PostgresMessageQueue(consumerSql);
    const controller = new AbortController();
    let consumed: unknown;

    try {
      await Promise.race([
        consumerQueue.listen(
          (value) => {
            consumed = value;
            controller.abort();
          },
          { signal: controller.signal },
        ),
        delay(10_000, undefined, { ref: false }).then(() => {
          throw new Error('Fedify queue listener timed out.');
        }),
      ]);
      assert.deepEqual(consumed, message);
    } finally {
      controller.abort();
      await consumerSql.end({ timeout: 5 });
    }
  });
});
