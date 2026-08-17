import { proxyActivities } from '@temporalio/workflow';
import type { PostDeleteInput } from '@kosmo/core/temporal/post-delete';
import type * as activities from '../activities';

const { deleteRepostNotificationActivity, sendRepostUndoActivity } = proxyActivities<
  Pick<typeof activities, 'deleteRepostNotificationActivity' | 'sendRepostUndoActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function postDeleteWorkflow({ postId, origin }: PostDeleteInput): Promise<void> {
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
