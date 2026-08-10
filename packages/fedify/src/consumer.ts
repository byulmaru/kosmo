import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { federation } from './federation';
import {
  closeFedifyQueue,
  fedifyQueue,
  fedifyRuntimeConfig,
  readFedifyRuntimeConfig,
} from './queue';
import type { Server } from 'node:http';
import type { Federation } from '@fedify/fedify';
import type { PostgresMessageQueue } from '@fedify/postgres';
import type { FedifyRuntimeConfig } from './queue';

export type ConsumerHealthState = 'starting' | 'ready' | 'stopping';

export const healthStatus = (path: string | undefined, state: ConsumerHealthState): number => {
  if (path === '/health') {
    return 200;
  }
  if (path === '/ready') {
    return state === 'ready' ? 200 : 503;
  }
  return 404;
};

export interface ConsumerRuntimeDependencies {
  readonly federation: Pick<Federation<void>, 'startQueue'>;
  readonly queue: Pick<PostgresMessageQueue, 'getDepth'>;
  readonly closeQueue: () => Promise<void>;
  readonly createServer?: typeof createServer;
}

export interface ConsumerRuntimeOptions {
  readonly config?: FedifyRuntimeConfig;
  readonly environment?: NodeJS.ProcessEnv;
  readonly dependencies?: ConsumerRuntimeDependencies;
}

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

const defaultDependencies = (): ConsumerRuntimeDependencies => {
  if (!fedifyQueue) {
    // The caller receives the more useful mode/configuration error before this
    // dependency is used.  Keep this branch typed without constructing a
    // direct-mode queue or a fallback database connection.
    throw new Error('Fedify queue consumer requires a PostgreSQL queue.');
  }
  return {
    federation,
    queue: fedifyQueue,
    closeQueue: closeFedifyQueue,
  };
};

/**
 * Run the standalone Fedify consumer.  No HTTP federation listener or
 * Temporal worker is started here; the only long-running task is
 * Federation.startQueue() over the shared PostgreSQL message queue.
 */
export async function runFedifyConsumer(options: ConsumerRuntimeOptions = {}): Promise<void> {
  const environment = options.environment ?? process.env;
  const config =
    options.config ??
    (environment === process.env ? fedifyRuntimeConfig : readFedifyRuntimeConfig(environment));
  if (config.mode !== 'consumer') {
    throw new Error(
      `Fedify queue consumer requires FEDIFY_RUNTIME_MODE=consumer (received ${config.mode}).`,
    );
  }
  if (!config.queueDatabaseUrl) {
    throw new Error('FEDIFY_QUEUE_DATABASE_URL is required for the Fedify queue consumer.');
  }

  const dependencies = options.dependencies ?? defaultDependencies();
  const port = parsePort(environment);
  const host = environment.HOST?.trim() || '127.0.0.1';
  let state: ConsumerHealthState = 'starting';
  let listening = false;
  let signalReceived = false;
  const abortController = new AbortController();
  const server = (dependencies.createServer ?? createServer)((request, response) => {
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
    await dependencies.queue.getDepth();
    const queueRun = dependencies.federation.startQueue(undefined, {
      signal: abortController.signal,
    });
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
      await dependencies.closeQueue();
    } finally {
      await closeHttpServer(server, listening);
    }
  }
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  await runFedifyConsumer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
