import { proxyActivities, workflowInfo } from '@temporalio/workflow';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

const { captureDatabaseCountsSnapshotActivity, loadDatabaseCountsSnapshotActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '45 seconds',
    scheduleToCloseTimeout: '5 minutes',
    retry: { maximumAttempts: 4 },
  });

export async function databaseCountsSnapshotWorkflow(): Promise<void> {
  const snapshot = await loadDatabaseCountsSnapshotActivity();
  if (snapshot === null) {
    return;
  }

  await settleEffects([
    captureDatabaseCountsSnapshotActivity({
      snapshot,
      eventId: workflowInfo().runId,
    }),
  ]);
}
