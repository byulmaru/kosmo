import { proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type ReactionCreateEffectsInput = {
  readonly reactionId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { createReactionNotificationActivity, sendReactionActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function reactionCreateEffectsWorkflow({
  reactionId,
  origin,
}: ReactionCreateEffectsInput): Promise<void> {
  await settleEffects([
    createReactionNotificationActivity(reactionId),
    ...match(origin)
      .with('LOCAL', () => [sendReactionActivity(reactionId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
