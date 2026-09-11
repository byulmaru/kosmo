import { Worker } from '@temporalio/worker';
import { createFedifyTemporalActivities } from './activities';
import type { NativeConnection, WorkerOptions } from '@temporalio/worker';
import type { TemporalFedifyQueue } from './queue';

export const fedifyTemporalWorkflowsPath = new URL('./workflows.ts', import.meta.url).pathname;

export type FedifyTemporalWorkerOptions = Readonly<{
  readonly connection: NativeConnection;
  readonly namespace: string;
  readonly taskQueue: string;
  readonly queue: TemporalFedifyQueue;
  /** Existing domain Activities can be registered by the owning application. */
  readonly activities?: WorkerOptions['activities'];
  readonly workflowsPath?: string;
}>;

/**
 * Compose the app-owned Worker registration for this PoC. Worker creation,
 * run, and shutdown stay with the caller.
 */
export const createFedifyTemporalWorker = async ({
  connection,
  namespace,
  taskQueue,
  queue,
  activities = {},
  workflowsPath = fedifyTemporalWorkflowsPath,
}: FedifyTemporalWorkerOptions): Promise<Worker> =>
  Worker.create({
    activities: {
      ...activities,
      ...createFedifyTemporalActivities(queue),
    },
    connection,
    namespace,
    taskQueue,
    workflowsPath,
  });
