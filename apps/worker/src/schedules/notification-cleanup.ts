import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ScheduleOverlapPolicy } from '@temporalio/client';
import type { ScheduleOptions } from '@temporalio/client';

export function notificationCleanupSchedule(namespace: string): ScheduleOptions {
  const scheduleId = `${namespace}-notification-cleanup`;

  return {
    scheduleId,
    spec: {
      intervals: [{ every: '24 hours' }],
    },
    action: {
      type: 'startWorkflow',
      workflowType: 'notificationCleanupWorkflow',
      workflowId: `${scheduleId}-workflow`,
      taskQueue: KOSMO_TASK_QUEUE,
      args: [],
    },
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    state: {
      paused: false,
    },
  };
}
