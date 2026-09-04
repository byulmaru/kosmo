import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const { cleanupUnavailableNotificationsActivity } = proxyActivities<typeof activities>({
  scheduleToCloseTimeout: '5 minutes',
  startToCloseTimeout: '30 seconds',
});

/**
 * Run one bounded cleanup batch. Temporal retries the Activity according to
 * its default policy; a retry may therefore remove a different batch.
 */
export async function cleanupUnavailableNotificationsWorkflow(): Promise<void> {
  await cleanupUnavailableNotificationsActivity();
}

export const notificationCleanupWorkflow = cleanupUnavailableNotificationsWorkflow;
