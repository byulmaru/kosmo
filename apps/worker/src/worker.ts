import { once } from 'node:events';
import { createServer } from 'node:http';
import { pg } from '@kosmo/core/db';
import { closeFedifyQueue } from '@kosmo/fedify';
import { NativeConnection, Worker } from '@temporalio/worker';
import { registration } from './registration';
import type { State } from '@temporalio/worker';

export function healthStatus(path: string | undefined, state?: State): number {
  if (path === '/health') {
    return 200;
  }
  if (path === '/ready') {
    return state === 'RUNNING' ? 200 : 503;
  }
  return 404;
}

export function validateWorkerEnvironment(environment: NodeJS.ProcessEnv): {
  address: string;
  namespace: string;
  port: number;
  host: string;
} {
  const address = environment.TEMPORAL_ADDRESS?.trim();
  const namespace = environment.TEMPORAL_NAMESPACE?.trim();
  const port = Number(environment.PORT ?? '8080');
  if (!address) {
    throw new Error('TEMPORAL_ADDRESS is required');
  }
  if (!namespace) {
    throw new Error('TEMPORAL_NAMESPACE is required');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return {
    address,
    namespace,
    port,
    host: environment.HOST?.trim() || '0.0.0.0',
  };
}

let workerRun: Promise<void> | undefined;

/**
 * Start the process-global Worker host exactly once.
 *
 * The business registration is compile-time owned by this package. There is
 * intentionally no caller-supplied registration or disabled/idle mode.
 */
export function runWorker(): Promise<void> {
  workerRun ??= startWorker();
  return workerRun;
}

async function startWorker(): Promise<void> {
  const { address, namespace, port, host } = validateWorkerEnvironment(process.env);

  let worker: Worker | undefined;
  const server = createServer((request, response) => {
    response.writeHead(healthStatus(request.url, worker?.getState())).end();
  });
  server.listen(port, host);
  await once(server, 'listening');

  const terminateDuringStartup = () => {
    process.off('SIGTERM', terminateDuringStartup);
    queueMicrotask(() => process.kill(process.pid, 'SIGTERM'));
  };
  process.once('SIGTERM', terminateDuringStartup);

  let connection: NativeConnection | undefined;
  try {
    connection = await NativeConnection.connect({ address });
    worker = await Worker.create({ ...registration, connection, namespace });
    const running = worker.run();
    process.off('SIGTERM', terminateDuringStartup);
    await running;
  } finally {
    process.off('SIGTERM', terminateDuringStartup);
    try {
      await connection?.close();
    } finally {
      try {
        await closeFedifyQueue();
      } finally {
        try {
          await pg.end({ timeout: 5 });
        } finally {
          await server[Symbol.asyncDispose]();
        }
      }
    }
  }
}
