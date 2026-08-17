import { proxyActivities } from '@temporalio/workflow';
import type { PostRepostInput } from '@kosmo/core/temporal/post-repost';
import type * as activities from '../activities';

const { createRepostNotificationActivity, sendRepostAnnounceActivity } = proxyActivities<
  Pick<typeof activities, 'createRepostNotificationActivity' | 'sendRepostAnnounceActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function postRepostWorkflow({ postId, origin }: PostRepostInput): Promise<void> {
  const effects = [createRepostNotificationActivity(postId)];
  if (origin === 'LOCAL') {
    effects.push(sendRepostAnnounceActivity(postId));
  }

  const results = await Promise.allSettled(effects);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
}
