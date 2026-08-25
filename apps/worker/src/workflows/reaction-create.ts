import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { settleEffects } from './settle-effects';
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
  const notification = createReactionNotificationActivity(reactionId);
  await match(origin)
    .with('LOCAL', () => settleEffects([notification, sendReactionActivity(reactionId)]))
    .with('ACTIVITYPUB', () => notification)
    .exhaustive();
}
