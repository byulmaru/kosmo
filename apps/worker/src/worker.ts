import { once } from 'node:events';
import { createServer } from 'node:http';
import { NativeConnection, Worker } from '@temporalio/worker';
import type { State, WorkerOptions } from '@temporalio/worker';

export type WorkerRegistration = Omit<WorkerOptions, 'connection' | 'namespace'>;

export function healthStatus(path: string | undefined, state?: State): number {
  if (path === '/health') {
    return 200;
  }
  if (path === '/ready') {
    return state === 'RUNNING' ? 200 : 503;
  }
  return 404;
}

export async function runWorker(
  registration: WorkerRegistration | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const hasHandler =
    registration?.workflowsPath ||
    registration?.workflowBundle ||
    Object.keys(registration?.activities ?? {}).length > 0;
  if (!registration?.taskQueue?.trim() || !hasHandler) {
    throw new Error('No business Worker registration is configured');
  }

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

  let worker: Worker | undefined;
  const server = createServer((request, response) => {
    response.writeHead(healthStatus(request.url, worker?.getState())).end();
  });
  server.listen(port, environment.HOST?.trim() || '0.0.0.0');
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
      await server[Symbol.asyncDispose]();
    }
  }
}
