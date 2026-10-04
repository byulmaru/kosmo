import { NotificationKind } from '@kosmo/core/enums';
import { patched, proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type PostRepostInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const { createNotificationActivity, createRepostNotificationActivity, sendRepostAnnounceActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function postRepostWorkflow({ postId, origin }: PostRepostInput): Promise<void> {
  const pushNotificationDispatchEnabled = patched('post-repost-push-notification-v1');

  await settleEffects([
    pushNotificationDispatchEnabled
      ? createNotificationActivity({ kind: NotificationKind.REPOST, sourceId: postId })
      : createRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostAnnounceActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
