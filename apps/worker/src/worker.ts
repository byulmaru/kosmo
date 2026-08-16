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
