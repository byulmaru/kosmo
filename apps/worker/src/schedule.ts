import { Client, ScheduleAlreadyRunning } from '@temporalio/client';
import { databaseCountsSnapshotSchedule } from './schedules/database-counts-snapshot';
import { notificationCleanupSchedule } from './schedules/notification-cleanup';
import type { ConnectionLike } from '@temporalio/client';

type ScheduleRegistration = {
  readonly scheduleId: string;
  readonly action: 'created' | 'unchanged';
};

export async function runSchedules(
  connection: ConnectionLike,
  namespace: string,
  environment: string | undefined,
): Promise<ScheduleRegistration[]> {
  const client = new Client({ connection, namespace });
  const registrations: ScheduleRegistration[] = [];

  return await client.withDeadline(Date.now() + 10_000, async () => {
    const schedules = [notificationCleanupSchedule(namespace)];
    if (environment === 'prod') {
      schedules.push(databaseCountsSnapshotSchedule(namespace));
    }

    for (const schedule of schedules) {
      try {
        await client.schedule.create(schedule);
        registrations.push({ scheduleId: schedule.scheduleId, action: 'created' });
      } catch (error) {
        if (error instanceof ScheduleAlreadyRunning) {
          registrations.push({ scheduleId: schedule.scheduleId, action: 'unchanged' });
          continue;
        }
        throw error;
      }
    }
    return registrations;
  });
}
