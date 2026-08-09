import type { State } from '@temporalio/worker';
import type { WorkerRegistration } from './registration';

export interface WorkerEnvironment {
  healthHost: string;
  healthPort: number;
  temporalAddress: string;
  temporalNamespace: string;
}

export interface TemporalWorkerHandle {
  close(): Promise<void>;
  getState(): State;
  run(): Promise<void>;
  shutdown(): void;
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function readWorkerEnvironment(environment: NodeJS.ProcessEnv): WorkerEnvironment {
  const healthPort = Number(environment.PORT ?? '8080');
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return {
    healthHost: environment.HOST?.trim() || '0.0.0.0',
    healthPort,
    temporalAddress: requiredEnvironmentValue(environment, 'TEMPORAL_ADDRESS'),
    temporalNamespace: requiredEnvironmentValue(environment, 'TEMPORAL_NAMESPACE'),
  };
}

export async function createTemporalWorker(
  registration: WorkerRegistration,
  environment: WorkerEnvironment,
): Promise<TemporalWorkerHandle> {
  const { NativeConnection, Worker } = await import('@temporalio/worker');
  const connection = await NativeConnection.connect({
    address: environment.temporalAddress,
  });

  try {
    const worker = await Worker.create({
      ...registration,
      connection,
      namespace: environment.temporalNamespace,
    });

    return {
      close: () => connection.close(),
      getState: () => worker.getState(),
      run: () => worker.run(),
      shutdown: () => worker.shutdown(),
    };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
