import { createHealthServer } from './health';
import { createTemporalWorker, readWorkerEnvironment } from './runtime';
import type { HealthServer, HealthServerOptions } from './health';
import type { WorkerRegistration } from './registration';
import type { TemporalWorkerHandle, WorkerEnvironment } from './runtime';

export const NO_WORKER_REGISTRATION_MESSAGE = 'No business Worker registration is configured';

export interface WorkerApplicationDependencies {
  createHealthServer(options: HealthServerOptions): Promise<HealthServer>;
  createTemporalWorker(
    registration: WorkerRegistration,
    environment: WorkerEnvironment,
  ): Promise<TemporalWorkerHandle>;
  onSignal(handler: () => void): () => void;
  readEnvironment(): WorkerEnvironment;
}

const productionDependencies: WorkerApplicationDependencies = {
  createHealthServer,
  createTemporalWorker,
  onSignal(handler) {
    process.once('SIGTERM', handler);
    return () => process.off('SIGTERM', handler);
  },
  readEnvironment: () => readWorkerEnvironment(process.env),
};

function hasBusinessHandler(registration: WorkerRegistration): boolean {
  return Boolean(
    registration.workflowsPath ||
    registration.workflowBundle ||
    Object.keys(registration.activities ?? {}).length > 0 ||
    registration.nexusServices?.length,
  );
}

export async function runWorkerApplication(
  registration: WorkerRegistration | undefined,
  dependencies: WorkerApplicationDependencies = productionDependencies,
): Promise<void> {
  if (registration === undefined || !hasBusinessHandler(registration)) {
    throw new Error(NO_WORKER_REGISTRATION_MESSAGE);
  }

  const environment = dependencies.readEnvironment();
  const healthServer = await dependencies.createHealthServer({
    host: environment.healthHost,
    port: environment.healthPort,
  });
  let removeSignalHandler = () => {};
  let worker: TemporalWorkerHandle | undefined;

  try {
    worker = await dependencies.createTemporalWorker(registration, environment);
    let stopping = false;
    removeSignalHandler = dependencies.onSignal(() => {
      if (stopping) {
        return;
      }
      stopping = true;
      healthServer.setReady(false);
      worker?.shutdown();
    });

    const run = worker.run();
    if (worker.getState() !== 'RUNNING') {
      throw new Error('Temporal Worker did not enter RUNNING state');
    }
    healthServer.setReady(true);
    await run;
  } finally {
    healthServer.setReady(false);
    removeSignalHandler();
    if (worker !== undefined) {
      await worker.close();
    }
    await healthServer.close();
  }
}
