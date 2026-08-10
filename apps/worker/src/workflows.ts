import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';

const { createReplyNotificationActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Durable Reply Notification lifecycle.
 *
 * Keep this function deterministic: all database access belongs to the
 * Activity, and the Workflow carries only the committed Reply identity.
 */
export async function replyNotificationWorkflow(replyId: string): Promise<void> {
  await createReplyNotificationActivity(replyId);
}
