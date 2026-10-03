import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ScheduleOverlapPolicy } from '@temporalio/client';
import type { ScheduleOptions } from '@temporalio/client';

export function databaseCountsSnapshotSchedule(namespace: string): ScheduleOptions {
  const scheduleId = `${namespace}-database-counts-snapshot`;

  return {
    scheduleId,
    spec: {
      intervals: [{ every: '24 hours' }],
    },
    action: {
      type: 'startWorkflow',
      workflowType: 'databaseCountsSnapshotWorkflow',
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
