import { once } from 'node:events';
import { createServer } from 'node:http';
import { federation } from './federation';
import { closeFedifyQueue, fedifyQueue } from './queue';
import type { Server } from 'node:http';

export const healthStatus = (
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

type ConsumerOptions = {
  readonly mode?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly startQueue?: (signal: AbortSignal) => Promise<void>;
  readonly getDepth?: () => Promise<unknown>;
  readonly closeQueue?: () => Promise<void>;
  readonly createServer?: typeof createServer;
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

/**
 * Run the standalone Fedify consumer.  No HTTP federation listener or
 * Temporal worker is started here; the only long-running task is
 * Federation.startQueue() over the shared PostgreSQL message queue.
 */
export async function runFedifyConsumer(options: ConsumerOptions = {}): Promise<void> {
  const environment = options.environment ?? process.env;
  const mode = options.mode ?? (environment.FEDIFY_RUNTIME_MODE?.trim() || 'direct');
  if (mode !== 'consumer') {
    throw new Error(
      `Fedify queue consumer requires FEDIFY_RUNTIME_MODE=consumer (received ${mode}).`,
    );
  }
  if (!fedifyQueue && (!options.startQueue || !options.getDepth)) {
    throw new Error('Fedify queue consumer requires a PostgreSQL queue.');
  }

  const startQueue =
    options.startQueue ?? ((signal: AbortSignal) => federation.startQueue(undefined, { signal }));
  const getDepth = options.getDepth ?? (() => fedifyQueue!.getDepth());
  const closeQueue = options.closeQueue ?? closeFedifyQueue;
  const port = parsePort(environment);
  const host = environment.HOST?.trim() || '127.0.0.1';
  let state: 'starting' | 'ready' | 'stopping' = 'starting';
  let listening = false;
  let signalReceived = false;
  const abortController = new AbortController();
  const server = (options.createServer ?? createServer)((request, response) => {
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

    // getDepth() uses the adapter's normal lazy initialization path.  This
    // verifies the configured database and adapter-owned table/index before
    // readiness without introducing a separate DDL command.
    await getDepth();
    const queueRun = startQueue(abortController.signal);
    state = 'ready';
    await queueRun;
  } catch (error) {
    // Abort is the expected completion path for SIGTERM/SIGINT.  Startup or
    // queue processing failures remain fatal so readiness never reports a
    // broken consumer as healthy.
    if (!signalReceived) {
      throw error;
    }
  } finally {
    state = 'stopping';
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    abortController.abort();
    try {
      await closeQueue();
    } finally {
      await closeHttpServer(server, listening);
    }
  }
}

if (import.meta.main) {
  await runFedifyConsumer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
