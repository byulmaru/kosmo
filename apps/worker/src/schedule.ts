import { Client, ScheduleAlreadyRunning } from '@temporalio/client';
import { notificationCleanupSchedule } from './schedules/notification-cleanup';
import type { ConnectionLike, ScheduleOptions } from '@temporalio/client';

type ScheduleClientLike = {
  readonly create: (options: ScheduleOptions) => Promise<unknown>;
};

type ScheduleRegistration = {
  readonly scheduleId: string;
  readonly action: 'created' | 'unchanged';
};

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
  connection: ConnectionLike,
  namespace: string,
): Promise<ScheduleRegistration[]> {
  const client = new Client({ connection, namespace });
  return await client.withDeadline(Date.now() + 10_000, () =>
    createSchedules(client.schedule, [notificationCleanupSchedule(namespace)]),
  );
}
