import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from '../workflows/activity-options';
import { settleEffects } from '../workflows/settle-effects';
import type * as activities from '../activities';

const { deleteRepostNotificationActivity, sendLocalPostDeleteActivity, sendRepostUndoActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

// Pre-cleanup command traces used to generate histories for replay.
export async function postDeleteWorkflow({
  postId,
  origin,
}: {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
}): Promise<void> {
  if (origin === 'LOCAL') {
    await sendLocalPostDeleteActivity(postId);
  }
}

export async function repostDeleteWorkflow({
  postId,
  origin,
}: {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
}): Promise<void> {
  await settleEffects([
    deleteRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostUndoActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
