import { Client, ScheduleAlreadyRunning } from '@temporalio/client';
import { notificationCleanupSchedule } from './schedules/notification-cleanup';
import type { ConnectionLike } from '@temporalio/client';

type ScheduleRegistration = {
  readonly scheduleId: string;
  readonly action: 'created' | 'unchanged';
};

export async function runSchedules(
  connection: ConnectionLike,
  namespace: string,
): Promise<ScheduleRegistration[]> {
  const client = new Client({ connection, namespace });
  const registrations: ScheduleRegistration[] = [];

  return await client.withDeadline(Date.now() + 10_000, async () => {
    for (const schedule of [notificationCleanupSchedule(namespace)]) {
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
