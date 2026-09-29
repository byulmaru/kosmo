import { patched, proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import { startPushNotificationWorkflow } from './start-push-notification';
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
  const pushNotificationDispatchEnabled = patched('reaction-create-effects-push-notification-v1');

  await settleEffects([
    createReactionNotificationActivity(reactionId).then((notificationId) =>
      pushNotificationDispatchEnabled ? startPushNotificationWorkflow(notificationId) : undefined,
    ),
    ...match(origin)
      .with('LOCAL', () => [sendReactionActivity(reactionId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
