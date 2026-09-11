import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { Client } from '@temporalio/client';
import { NativeConnection } from '@temporalio/worker';
import {
  configureFedifyTemporalDemo,
  createFedifyTemporalDemoInboxMessage,
  createFedifyTemporalFederation,
} from './federation';
import { TemporalFedifyQueue } from './queue';
import { createFedifyTemporalWorker } from './worker';
import type { Worker } from '@temporalio/worker';

const inheritedDatabaseEnvironment = [
  'DATABASE_URL',
  'DATABASE_PASSWORD',
  'FEDIFY_QUEUE_DATABASE_URL',
  'FEDIFY_QUEUE_DATABASE_PASSWORD',
  'PGDATABASE',
  'PGHOST',
  'PGPASSWORD',
  'PGPORT',
  'PGUSER',
] as const;

type DomainRuntime = Readonly<{
  readonly activities: object;
  readonly close: () => Promise<void>;
}>;

const loadDomainRuntime = async (): Promise<DomainRuntime> => {
  // Keep the real registry in the same Worker composition as production. The
  // import is intentionally delayed until after the loopback/environment gate
  // so this opt-in PoC cannot initialize an inherited application DB or the
  // production Fedify PostgreSQL queue.
  const activities = await import('../../src/activities');
  const [{ pg }, { closeFedifyQueue }] = await Promise.all([
    import('@kosmo/core/db'),
    import('@kosmo/fedify'),
  ]);

  return {
    activities,
    close: async () => {
      try {
        await closeFedifyQueue();
      } finally {
        await pg.end({ timeout: 5 });
      }
    },
  };
};

const requiredEnvironment = (environment: NodeJS.ProcessEnv) => {
  const address = environment.TEMPORAL_ADDRESS?.trim();
  const namespace = environment.TEMPORAL_NAMESPACE?.trim();
  if (!address) {
    throw new Error('TEMPORAL_ADDRESS is required');
  }
  if (!namespace) {
    throw new Error('TEMPORAL_NAMESPACE is required');
  }
  const host = address.startsWith('[')
    ? address.slice(1, address.indexOf(']'))
    : address.split(':', 1)[0];
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Fedify Temporal PoC only accepts a loopback TEMPORAL_ADDRESS');
  }
  const inherited = inheritedDatabaseEnvironment.filter((name) => environment[name]?.trim());
  if (inherited.length > 0) {
    throw new Error(
      `Fedify Temporal PoC requires database environment to be unset: ${inherited.join(', ')}`,
    );
  }
  return {
    address,
    namespace,
    // The default is isolated so a local experiment cannot send an unknown
    // Workflow type to the production Worker on the shared `kosmo` queue.
    taskQueue: environment.TEMPORAL_TASK_QUEUE?.trim() || `${KOSMO_TASK_QUEUE}-fedify-poc`,
    demo: environment.FEDIFY_TEMPORAL_DEMO === '1',
  };
};

/** Run the opt-in local PoC. Importing this module does not start a process. */
export async function runFedifyTemporalPoc(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { address, namespace, taskQueue, demo } = requiredEnvironment(environment);
  let domainRuntime: DomainRuntime | undefined;
  let connection: NativeConnection | undefined;
  let queueRun: Promise<void> | undefined;
  let workerRun: Promise<void> | undefined;
  const abortController = new AbortController();
  let worker: Worker | undefined;

  const stop = () => {
    if (worker?.getState() === 'RUNNING') {
      // Let Temporal drain in-flight Activities before the queue listener is
      // aborted. The handler closure must remain available during that drain.
      worker.shutdown();
    } else {
      // Worker creation has not completed yet, so no SDK shutdown hook exists.
      abortController.abort();
    }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  try {
    domainRuntime = await loadDomainRuntime();
    connection = await NativeConnection.connect({ address });
    const client = new Client({ connection, namespace });
    const queue = new TemporalFedifyQueue(client, taskQueue);
    const federation = createFedifyTemporalFederation(queue, {
      origin: environment.PUBLIC_ORIGIN?.trim() || 'https://local.example',
    });
    configureFedifyTemporalDemo(federation);

    // This invokes Fedify's public startQueue path. `queue.listening` is the
    // short readiness edge; `queueRun` remains pending until shutdown.
    queueRun = federation.startQueue(undefined, { signal: abortController.signal });
    await Promise.race([
      queue.listening,
      queueRun.then(() => {
        throw new Error('Fedify queue stopped before the Temporal Worker started');
      }),
    ]);
    if (abortController.signal.aborted) {
      return;
    }

    worker = await createFedifyTemporalWorker({
      connection,
      namespace,
      queue,
      taskQueue,
      activities: domainRuntime.activities,
    });
    workerRun = worker.run();
    // A signal can arrive while Worker.create is compiling the bundle. The
    // created Worker still owns a NativeConnection reference, so always enter
    // run() and let its normal drain path release that reference before close.
    if (abortController.signal.aborted) {
      await Promise.resolve();
      if (worker.getState() === 'RUNNING') {
        worker.shutdown();
      }
    } else if (demo) {
      await queue.enqueue(createFedifyTemporalDemoInboxMessage(), {
        orderingKey: 'fedify-temporal-demo',
      });
      console.info('Fedify Temporal demo inbox message enqueued');
    }
    // The queue listener resolves only after abort. Racing lets either a
    // Worker failure or a queue failure reach cleanup without waiting on the
    // other long-lived promise first.
    await Promise.race([workerRun, queueRun]);
  } finally {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    if (worker?.getState() === 'RUNNING') {
      worker.shutdown();
    }
    await workerRun?.catch(() => undefined);
    // Only release the Fedify handler after Worker Activities have drained.
    abortController.abort();
    await queueRun?.catch(() => undefined);
    try {
      await domainRuntime?.close();
    } finally {
      await connection?.close();
    }
  }
}

if (import.meta.main) {
  await runFedifyTemporalPoc().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
