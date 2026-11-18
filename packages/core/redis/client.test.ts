import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@redis/client';

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;
const { runRedisCommand } = await import('./client.ts');

async function getUnusedLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

test('returns unavailable when Redis is not configured', async () => {
  const previousRedisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  try {
    assert.equal(await runRedisCommand((client) => client.ping()), null);
  } finally {
    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }
  }
});

test('lets a process exit after its Redis connection attempt fails', async () => {
  const port = await getUnusedLocalPort();
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `const { runRedisCommand } = await import('./client.ts');
      const { performance } = await import('node:perf_hooks');
      const initial = await runRedisCommand((client) => client.ping());
      const startedAt = performance.now();
      const waited = await runRedisCommand((client) => client.ping(), { waitForReady: true });
      if (initial !== null || waited !== null) {
        throw new Error('unreachable Redis must be unavailable');
      }
      if (performance.now() - startedAt > 1_000) {
        throw new Error('waitForReady exceeded its bounded connection wait');
      }`,
    ],
    {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      env: { ...process.env, REDIS_URL: `redis://127.0.0.1:${port}` },
      timeout: 3_000,
    },
  );

  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test(
  'waitForReady publishes once after a cold Redis connection',
  { skip: !testRedisUrl },
  async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = testRedisUrl;

    const observer = createClient({ url: testRedisUrl! });
    const channel = `kosmo:test:redis:${randomUUID()}`;
    const observed = Promise.withResolvers<string>();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let subscribed = false;

    try {
      await observer.connect();
      await observer.subscribe(channel, (message) => {
        observed.resolve(message);
      });
      subscribed = true;
      timeout = setTimeout(() => {
        observed.reject(new Error('waitForReady publish was not observed'));
      }, 1_000);

      const message = JSON.stringify({ detail: true });
      const result = await runRedisCommand((client) => client.publish(channel, message), {
        waitForReady: true,
      });

      assert.deepEqual(result, { value: 1 });
      assert.equal(await observed.promise, message);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      if (subscribed) {
        await observer.unsubscribe(channel);
      }
      observer.destroy();
      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }
    }
  },
);

test(
  'returns unavailable after a delayed Redis reply and reconnects on the next request',
  { skip: !testRedisUrl },
  async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = testRedisUrl;

    try {
      let ping: { value: string } | null = null;
      const connectDeadline = performance.now() + 5_000;
      while (performance.now() < connectDeadline) {
        ping = await runRedisCommand((client) => client.ping());
        if (ping?.value === 'PONG') {
          break;
        }
        await delay(25);
      }
      assert.equal(ping?.value, 'PONG', 'Redis test service did not become ready');

      const commandStartedAt = performance.now();
      const delayedReply = await runRedisCommand((client) =>
        client.blPop(`kosmo:test:redis:${randomUUID()}`, 2),
      );
      const commandElapsedMs = performance.now() - commandStartedAt;

      assert.equal(delayedReply, null);
      assert.ok(commandElapsedMs >= 200, 'the Redis command did not reach its deadline');
      assert.ok(commandElapsedMs < 1_000, 'the Redis command exceeded its deadline');

      ping = null;
      const recoveryDeadline = performance.now() + 5_000;
      while (performance.now() < recoveryDeadline) {
        ping = await runRedisCommand((client) => client.ping());
        if (ping?.value === 'PONG') {
          break;
        }
        await delay(25);
      }

      assert.equal(ping?.value, 'PONG', 'the shared client did not reconnect after timeout');
    } finally {
      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }
    }
  },
);
