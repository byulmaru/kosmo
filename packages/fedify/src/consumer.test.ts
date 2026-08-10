import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, test } from 'node:test';
import { healthStatus, runFedifyConsumer } from './consumer';
import type { Server } from 'node:http';

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
    let checkedDepth = false;
    let started = false;
    let queueSignal: AbortSignal | undefined;
    const running = runFedifyConsumer({
      config: { mode: 'consumer', queueDatabaseUrl: 'postgres://queue.example/fedify' },
      dependencies: {
        closeQueue: async () => {
          closed += 1;
        },
        createServer: (() => server) as never,
        federation: {
          startQueue: async (_contextData, options) => {
            started = true;
            queueSignal = options?.signal;
            await new Promise<void>((resolve) =>
              options?.signal?.addEventListener('abort', () => resolve(), { once: true }),
            );
          },
        },
        queue: {
          getDepth: async () => {
            checkedDepth = true;
            return { queued: 0, ready: 0, delayed: 0 };
          },
        },
      },
      environment: { HOST: '127.0.0.1', PORT: '8080' },
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(checkedDepth, true);
    assert.equal(started, true);
    assert.equal(queueSignal?.aborted, false);

    process.emit('SIGTERM');
    await running;

    assert.equal(queueSignal?.aborted, true);
    assert.equal(closed, 1);
  });
});
