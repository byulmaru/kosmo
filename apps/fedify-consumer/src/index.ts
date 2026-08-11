import { once } from 'node:events';
import { createServer } from 'node:http';
import { pg } from '@kosmo/core/db';
import { closeFedifyQueue, federation } from '@kosmo/fedify';
import type { Server } from 'node:http';

const healthStatus = (
  path: string | undefined,
  state: 'starting' | 'ready' | 'stopping',
): number => {
  if (path === '/health') {
    return 200;
  }
  if (path === '/ready') {
    return state === 'ready' ? 200 : 503;
  }
  return 404;
};

const parsePort = (environment: NodeJS.ProcessEnv): number => {
  const value = Number(environment.PORT ?? '8080');
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return value;
};

const closeHttpServer = async (server: Server, listening: boolean): Promise<void> => {
  if (!listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

async function run(): Promise<void> {
  if (!process.env.FEDIFY_QUEUE_DATABASE_URL?.trim()) {
    throw new Error('FEDIFY_QUEUE_DATABASE_URL is required.');
  }

  const port = parsePort(process.env);
  const host = process.env.HOST?.trim() || '127.0.0.1';
  let state: 'starting' | 'ready' | 'stopping' = 'starting';
  let listening = false;
  let signalReceived = false;
  const abortController = new AbortController();
  const server = createServer((request, response) => {
    const path = request.url?.split('?', 1)[0];
    response.writeHead(healthStatus(path, state)).end();
  });

  const stop = () => {
    signalReceived = true;
    state = 'stopping';
    abortController.abort();
  };

  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  try {
    server.listen(port, host);
    await once(server, 'listening');
    listening = true;
    if (abortController.signal.aborted) {
      return;
    }

    const queueRun = federation.startQueue(undefined, { signal: abortController.signal });
    state = 'ready';
    await queueRun;
  } catch (error) {
    if (!signalReceived) {
      throw error;
    }
  } finally {
    state = 'stopping';
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    abortController.abort();
    try {
      await closeFedifyQueue();
    } finally {
      try {
        await pg.end({ timeout: 5 });
      } finally {
        await closeHttpServer(server, listening);
      }
    }
  }
}

if (import.meta.main) {
  await run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
