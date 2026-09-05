import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  Client,
  Connection,
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from '@temporalio/client';
import { z } from 'zod';
import type { ScheduleOptions } from '@temporalio/client';

const scheduleEnvironmentSchema = z.object({
  TEMPORAL_ADDRESS: z
    .string({ error: 'TEMPORAL_ADDRESS is required' })
    .trim()
    .min(1, 'TEMPORAL_ADDRESS is required'),
  TEMPORAL_NAMESPACE: z
    .string({ error: 'TEMPORAL_NAMESPACE is required' })
    .trim()
    .min(1, 'TEMPORAL_NAMESPACE is required'),
});

type NotificationCleanupScheduleEnvironment = {
  readonly address: string;
  readonly namespace: string;
};

type ScheduleClientLike = {
  readonly create: (options: ScheduleOptions) => Promise<unknown>;
};

export function parseScheduleEnvironment(
  environment: NodeJS.ProcessEnv,
): NotificationCleanupScheduleEnvironment {
  const result = scheduleEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Schedule environment is invalid');
  }

  return {
    address: result.data.TEMPORAL_ADDRESS,
    namespace: result.data.TEMPORAL_NAMESPACE,
  };
}

export async function createNotificationCleanupSchedule(
  scheduleClient: ScheduleClientLike,
  scheduleId: string,
): Promise<'created' | 'unchanged'> {
  try {
    await scheduleClient.create({
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
    });
    return 'created';
  } catch (error) {
    if (error instanceof ScheduleAlreadyRunning) {
      return 'unchanged';
    }
    throw error;
  }
}

export async function runNotificationCleanupSchedule(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<'created' | 'unchanged'> {
  const config = parseScheduleEnvironment(environment);
  const connection = await Connection.connect({
    address: config.address,
    connectTimeout: '10 seconds',
  });

  try {
    const client = new Client({ connection, namespace: config.namespace });
    return await createNotificationCleanupSchedule(
      client.schedule,
      `${config.namespace}-notification-cleanup`,
    );
  } finally {
    await connection.close();
  }
}

if (import.meta.main) {
  try {
    const action = await runNotificationCleanupSchedule();
    console.log(JSON.stringify({ event: 'notification_cleanup_schedule', action }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
