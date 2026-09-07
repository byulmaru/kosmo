import { Client, Connection, ScheduleAlreadyRunning } from '@temporalio/client';
import { z } from 'zod';
import type { ScheduleOptions } from '@temporalio/client';
import { notificationCleanupSchedule } from './schedules/notification-cleanup';

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

type ScheduleEnvironment = {
  readonly address: string;
  readonly namespace: string;
};

type ScheduleClientLike = {
  readonly create: (options: ScheduleOptions) => Promise<unknown>;
};

type ScheduleRegistration = {
  readonly scheduleId: string;
  readonly action: 'created' | 'unchanged';
};

export function parseScheduleEnvironment(environment: NodeJS.ProcessEnv): ScheduleEnvironment {
  const result = scheduleEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Schedule environment is invalid');
  }

  return {
    address: result.data.TEMPORAL_ADDRESS,
    namespace: result.data.TEMPORAL_NAMESPACE,
  };
}

export async function createScheduleIfMissing(
  scheduleClient: ScheduleClientLike,
  options: ScheduleOptions,
): Promise<ScheduleRegistration> {
  try {
    await scheduleClient.create(options);
    return { scheduleId: options.scheduleId, action: 'created' };
  } catch (error) {
    if (error instanceof ScheduleAlreadyRunning) {
      return { scheduleId: options.scheduleId, action: 'unchanged' };
    }
    throw error;
  }
}

export async function createSchedules(
  scheduleClient: ScheduleClientLike,
  schedules: readonly ScheduleOptions[],
): Promise<ScheduleRegistration[]> {
  const registrations: ScheduleRegistration[] = [];
  for (const schedule of schedules) {
    registrations.push(await createScheduleIfMissing(scheduleClient, schedule));
  }
  return registrations;
}

export async function runSchedules(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ScheduleRegistration[]> {
  const config = parseScheduleEnvironment(environment);
  const connection = await Connection.connect({
    address: config.address,
    connectTimeout: '10 seconds',
  });

  try {
    const client = new Client({ connection, namespace: config.namespace });
    return await createSchedules(client.schedule, [notificationCleanupSchedule(config.namespace)]);
  } finally {
    await connection.close();
  }
}

if (import.meta.main) {
  try {
    const schedules = await runSchedules();
    console.log(JSON.stringify({ event: 'temporal_schedules_registered', schedules }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
