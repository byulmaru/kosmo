import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgresKvStore } from '@fedify/postgres';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

describe('Fedify PostgreSQL key-value store', { skip: !databaseUrl }, () => {
  test('shares and persists values, expires TTLs, and deletes keys', async () => {
    const key = ['kosmo', 'test', randomUUID()] as const;
    const expiringKey = ['kosmo', 'test', randomUUID()] as const;
    const value = { persisted: true };
    const writerSql = postgres(databaseUrl!);
    const sharedSql = postgres(databaseUrl!);

    try {
      await new PostgresKvStore(writerSql).set(key, value);
      assert.deepEqual(await new PostgresKvStore(sharedSql).get(key), value);
    } finally {
      await Promise.all([writerSql.end({ timeout: 5 }), sharedSql.end({ timeout: 5 })]);
    }

    const restartedSql = postgres(databaseUrl!);
    const restartedStore = new PostgresKvStore(restartedSql);

    try {
      assert.deepEqual(await restartedStore.get(key), value);

      await restartedStore.set(expiringKey, 'expired', {
        ttl: Temporal.Duration.from({ milliseconds: 10 }),
      });
      await delay(50);
      assert.equal(await restartedStore.get(expiringKey), undefined);

      await restartedStore.delete(key);
      assert.equal(await restartedStore.get(key), undefined);
    } finally {
      await Promise.all([restartedStore.delete(key), restartedStore.delete(expiringKey)]);
      await restartedSql.end({ timeout: 5 });
    }
  });
});
