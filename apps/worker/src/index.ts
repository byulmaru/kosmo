import { KOSMO_TASK_QUEUE } from '@kosmo/core/services';
import { createReplyNotificationActivity } from './activities';
import { runWorker } from './worker';
import type { WorkerRegistration } from './worker';

export const registration: WorkerRegistration = {
  activities: { createReplyNotificationActivity },
  taskQueue: KOSMO_TASK_QUEUE,
  workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
};

if (import.meta.main) {
  try {
    await runWorker(registration);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
