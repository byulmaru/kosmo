import { proxyActivities } from '@temporalio/workflow';
import type { ReactionDeleteEffectsInput } from '@kosmo/core/temporal/reaction-delete';
import type * as activities from '../activities';

const { deleteReactionNotificationActivity, sendReactionUndoActivity } = proxyActivities<
  Pick<typeof activities, 'deleteReactionNotificationActivity' | 'sendReactionUndoActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function reactionDeleteEffectsWorkflow({
  id,
  profileId,
  postId,
  type,
  createdAt,
  origin,
}: ReactionDeleteEffectsInput): Promise<void> {
  const effects = [deleteReactionNotificationActivity(id)];
  if (origin === 'LOCAL') {
    effects.push(
      sendReactionUndoActivity({
        id,
        profileId,
        postId,
        type,
        createdAt,
      }),
    );
  }

  const results = await Promise.allSettled(effects);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
}
