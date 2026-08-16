import { KOSMO_TASK_QUEUE } from '@kosmo/core/services';
import { createReplyNotificationActivity, sendLocalPostCreateActivity } from './activities';
import type { WorkerOptions } from '@temporalio/worker';

/** The one production business registration owned by this Worker package. */
export const registration = {
  activities: {
    createReplyNotificationActivity,
    sendLocalPostCreateActivity,
  },
  taskQueue: KOSMO_TASK_QUEUE,
  workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
} satisfies Omit<WorkerOptions, 'connection' | 'namespace'>;
