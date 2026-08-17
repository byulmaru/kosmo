import { proxyActivities } from '@temporalio/workflow';
import type { PostCreateEffectsInput } from '@kosmo/core/temporal/post-create-effects';
import type * as activities from '../activities';

const { createReplyNotificationActivity, sendLocalPostCreateActivity } = proxyActivities<
  Pick<typeof activities, 'createReplyNotificationActivity' | 'sendLocalPostCreateActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

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
