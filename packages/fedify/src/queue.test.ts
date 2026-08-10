import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { describe, test } from 'node:test';
import { PostgresMessageQueue } from '@fedify/postgres';
import postgres from 'postgres';
import { healthStatus, runFedifyConsumer } from './consumer';
import type { Server } from 'node:http';

const queueModuleUrl = new URL('./queue.ts', import.meta.url).href;

const importQueue = (environment: NodeJS.ProcessEnv) =>
  spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `const queue = await import(${JSON.stringify(queueModuleUrl)}); console.log(Boolean(queue.fedifyQueue)); await queue.closeFedifyQueue();`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FEDIFY_QUEUE_DATABASE_PASSWORD: '',
        FEDIFY_QUEUE_DATABASE_URL: '',
        ...environment,
      },
    },
  );

describe('Fedify queue configuration', () => {
  test('stays direct when only a queue URL exists', () => {
    const result = importQueue({
      FEDIFY_RUNTIME_MODE: 'direct',
      FEDIFY_QUEUE_DATABASE_URL: 'postgres://queue.example/fedify',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'false');
  });

  test('rejects unsupported and incomplete queue modes', () => {
    const unsupported = importQueue({ FEDIFY_RUNTIME_MODE: 'worker' });
    assert.notEqual(unsupported.status, 0);
    assert.match(unsupported.stderr, /FEDIFY_RUNTIME_MODE/);

    const missingUrl = importQueue({ FEDIFY_RUNTIME_MODE: 'consumer' });
    assert.notEqual(missingUrl.status, 0);
    assert.match(missingUrl.stderr, /FEDIFY_QUEUE_DATABASE_URL/);

    const ownerFallback = importQueue({
      DATABASE_PASSWORD: 'owner password',
      FEDIFY_RUNTIME_MODE: 'producer',
      FEDIFY_QUEUE_DATABASE_URL: 'postgres://queue.example/fedify',
    });
    assert.notEqual(ownerFallback.status, 0);
    assert.match(ownerFallback.stderr, /FEDIFY_QUEUE_DATABASE_PASSWORD/);
  });

  test('fails startup when the configured queue cannot be initialized', () => {
    const result = importQueue({
      FEDIFY_RUNTIME_MODE: 'producer',
      FEDIFY_QUEUE_DATABASE_PASSWORD: 'queue password',
      FEDIFY_QUEUE_DATABASE_URL: 'postgres://127.0.0.1:1/fedify',
    });

    assert.notEqual(result.status, 0);
  });
});

describe('Fedify queue consumer lifecycle', () => {
  test('distinguishes liveness from queue readiness', () => {
    assert.equal(healthStatus('/health', 'starting'), 200);
    assert.equal(healthStatus('/ready', 'starting'), 503);
    assert.equal(healthStatus('/ready', 'ready'), 200);
    assert.equal(healthStatus('/ready', 'stopping'), 503);
    assert.equal(healthStatus('/metrics', 'ready'), 404);
  });

  test('aborts the queue and closes its pool on SIGTERM', async () => {
    const server = new EventEmitter() as EventEmitter & Pick<Server, 'listen' | 'close'>;
    server.listen = (() => {
      queueMicrotask(() => server.emit('listening'));
      return server as unknown as Server;
    }) as Server['listen'];
    server.close = ((callback?: (error?: Error) => void) => {
      callback?.();
      return server as unknown as Server;
    }) as Server['close'];

    let closed = 0;
    let queueSignal: AbortSignal | undefined;
    const running = runFedifyConsumer({
      closeQueue: async () => {
        closed += 1;
      },
      createServer: (() => server) as never,
      mode: 'consumer',
      startQueue: async (signal) => {
        queueSignal = signal;
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      },
      environment: { HOST: '127.0.0.1', PORT: '8080' },
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(queueSignal?.aborted, false);

    process.emit('SIGTERM');
    await running;

    assert.equal(queueSignal?.aborted, true);
    assert.equal(closed, 1);
  });
});

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
  test('initializes a producer before the queue module finishes loading', () => {
    const result = importQueue({
      FEDIFY_RUNTIME_MODE: 'producer',
      FEDIFY_QUEUE_DATABASE_PASSWORD: queueDatabasePassword ?? '',
      FEDIFY_QUEUE_DATABASE_URL: queueDatabaseUrl!,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /(?:^|\n)true\s*$/);
  });

  test('implicitly initializes, reports depth, consumes, and closes', async () => {
    const sql = postgres(
      queueDatabaseUrl!,
      queueDatabasePassword ? { password: queueDatabasePassword } : undefined,
    );
    const queue = new PostgresMessageQueue(sql);
    const controller = new AbortController();
    const messageId = randomUUID();
    let consumed: unknown;
    let resolveConsumed: (() => void) | undefined;
    const consumedPromise = new Promise<void>((resolve) => {
      resolveConsumed = resolve;
    });

    try {
      const initial = await queue.getDepth();
      assert.deepEqual(initial, { queued: 0, ready: 0, delayed: 0 });

      await queue.enqueue({ messageId });
      assert.deepEqual(await queue.getDepth(), { queued: 1, ready: 1, delayed: 0 });

      const listener = queue.listen(
        async (message) => {
          consumed = message;
          resolveConsumed?.();
          controller.abort();
        },
        { signal: controller.signal },
      );
      await Promise.race([
        consumedPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Fedify queue listener timed out.')), 10_000).unref();
        }),
      ]);
      await listener;

      assert.deepEqual(consumed, { messageId });
      assert.deepEqual(await queue.getDepth(), { queued: 0, ready: 0, delayed: 0 });
    } finally {
      controller.abort();
      await sql.end({ timeout: 5 });
    }
  });
});
