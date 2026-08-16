import { proxyActivities } from '@temporalio/workflow';
import type { PostCreateEffectsInput } from '@kosmo/core/temporal/post-create-effects';
import type { RepostEffectsInput } from '@kosmo/core/temporal/repost-effects';
import type * as activities from './activities';

const {
  createReplyNotificationActivity,
  createRepostNotificationActivity,
  deleteRepostNotificationActivity,
  sendLocalPostCreateActivity,
  sendRepostAnnounceActivity,
  sendRepostUndoActivity,
} = proxyActivities<typeof activities>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

/**
 * Run the effects of a committed Post independently.
 *
 * The workflow contains only serializable identity and origin. Database and
 * federation access stays inside Activities. ActivityPub-origin Posts do not
 * enqueue an outbound Create echo.
 */
export async function postCreateEffectsWorkflow({
  postId,
  origin,
}: PostCreateEffectsInput): Promise<void> {
  const effects = [createReplyNotificationActivity(postId)];
  if (origin === 'LOCAL') {
    effects.push(sendLocalPostCreateActivity(postId));
  }

  const results = await Promise.allSettled(effects);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
}

/**
 * Run the effects of a committed Repost transition independently.
 *
 * A delete input carries the committed Tombstone snapshot. The current
 * Activity aliases use the stable Repost ID and read the canonical projection;
 * the remaining fields preserve the committed transition in Workflow history.
 */
export async function repostEffectsWorkflow(input: RepostEffectsInput): Promise<void> {
  const effects =
    input.transition === 'CREATE'
      ? [
          createRepostNotificationActivity(input.repostId),
          ...(input.origin === 'LOCAL' ? [sendRepostAnnounceActivity(input.repostId)] : []),
        ]
      : [
          deleteRepostNotificationActivity(input.repostId),
          ...(input.origin === 'LOCAL' ? [sendRepostUndoActivity(input.repostId)] : []),
        ];

  const results = await Promise.allSettled(effects);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
}
