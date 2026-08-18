import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

type ReactionCreateEffectsInput = {
  readonly reactionId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { createReactionNotificationActivity, sendReactionActivity } = proxyActivities<
  Pick<typeof activities, 'createReactionNotificationActivity' | 'sendReactionActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function reactionCreateEffectsWorkflow({
  reactionId,
  origin,
}: ReactionCreateEffectsInput): Promise<void> {
  const effects = [createReactionNotificationActivity(reactionId)];
  if (origin === 'LOCAL') {
    effects.push(sendReactionActivity(reactionId));
  }

  const results = await Promise.allSettled(effects);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }
}
