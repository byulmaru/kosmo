import { proxyActivities } from '@temporalio/workflow';
import type { PostDeleteInput } from '@kosmo/core/temporal/post-delete';
import type * as activities from '../activities';

const { deleteRepostNotificationActivity, sendLocalPostDeleteActivity, sendRepostUndoActivity } =
  proxyActivities<
    Pick<
      typeof activities,
      'deleteRepostNotificationActivity' | 'sendLocalPostDeleteActivity' | 'sendRepostUndoActivity'
    >
  >({
    retry: { maximumAttempts: 10 },
    startToCloseTimeout: '1 minute',
  });

export async function postDeleteWorkflow({
  postKind,
  origin,
  postId,
}: PostDeleteInput): Promise<void> {
  const effects: Promise<void>[] = [];
  switch (postKind) {
    case 'POST':
    case 'REPLY':
    case 'QUOTE':
    case 'REPLY_QUOTE':
      if (origin === 'LOCAL') {
        effects.push(sendLocalPostDeleteActivity(postId));
      }
      break;
    case 'REPOST':
      effects.push(deleteRepostNotificationActivity(postId));
      if (origin === 'LOCAL') {
        effects.push(sendRepostUndoActivity(postId));
      }
      break;
  }

  const results = await Promise.allSettled(effects);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
}
