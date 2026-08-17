import { proxyActivities } from '@temporalio/workflow';
import type { RepostDeleteInput } from '@kosmo/core/temporal/repost-delete';
import type * as activities from '../activities';

const { deleteRepostNotificationActivity, sendRepostUndoActivity } = proxyActivities<
  Pick<typeof activities, 'deleteRepostNotificationActivity' | 'sendRepostUndoActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function repostDeleteWorkflow({ postId, origin }: RepostDeleteInput): Promise<void> {
  const effects = [deleteRepostNotificationActivity(postId)];
  if (origin === 'LOCAL') {
    effects.push(sendRepostUndoActivity(postId));
  }

  const results = await Promise.allSettled(effects);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
}
