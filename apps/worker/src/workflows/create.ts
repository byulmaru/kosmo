import { NotificationKind } from '@kosmo/core/enums';
import { patched, proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type PostCreateEffectsInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const {
  createNotificationActivity,
  createQuoteNotificationActivity,
  createReplyNotificationActivity,
  sendLocalPostCreateActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postCreateEffectsWorkflow({
  postId,
  origin,
}: PostCreateEffectsInput): Promise<void> {
  const pushNotificationDispatchEnabled = patched('post-create-effects-push-notification-v1');
  await settleEffects([
    pushNotificationDispatchEnabled
      ? createNotificationActivity({ kind: NotificationKind.REPLY, sourceId: postId })
      : createReplyNotificationActivity(postId),
    ...(patched('post-create-effects-quote-notification-v1')
      ? [
          pushNotificationDispatchEnabled
            ? createNotificationActivity({ kind: NotificationKind.QUOTE, sourceId: postId })
            : createQuoteNotificationActivity(postId),
        ]
      : []),
    ...match(origin)
      .with('LOCAL', () => [sendLocalPostCreateActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
