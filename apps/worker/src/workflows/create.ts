import { patched, proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import { startPushNotificationWorkflow } from './start-push-notification';
import type * as activities from '../activities';

type PostCreateEffectsInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const {
  createQuoteNotificationActivity,
  createMentionNotificationActivity,
  createReplyNotificationActivity,
  sendLocalPostCreateActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postCreateEffectsWorkflow({
  postId,
  origin,
}: PostCreateEffectsInput): Promise<void> {
  const pushNotificationDispatchEnabled = patched('post-create-effects-push-notification-v1');
  const mentionNotificationEnabled = patched('post-create-effects-mention-notification-v1');
  await settleEffects([
    createReplyNotificationActivity(postId).then((notificationId) =>
      pushNotificationDispatchEnabled ? startPushNotificationWorkflow(notificationId) : undefined,
    ),
    ...(patched('post-create-effects-quote-notification-v1')
      ? [
          createQuoteNotificationActivity(postId).then((notificationId) =>
            pushNotificationDispatchEnabled
              ? startPushNotificationWorkflow(notificationId)
              : undefined,
          ),
        ]
      : []),
    ...(mentionNotificationEnabled
      ? [
          createMentionNotificationActivity(postId).then((notificationIds) =>
            pushNotificationDispatchEnabled
              ? Promise.all(notificationIds.map(startPushNotificationWorkflow))
              : undefined,
          ),
        ]
      : []),
    ...match(origin)
      .with('LOCAL', () => [sendLocalPostCreateActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
