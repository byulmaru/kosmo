import { proxyActivities } from '@temporalio/workflow';
import type { PostCreateEffectsInput } from '@kosmo/core/services';
import type * as activities from './activities';

const { createReplyNotificationActivity, sendLocalPostCreateActivity } = proxyActivities<
  typeof activities
>({
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
