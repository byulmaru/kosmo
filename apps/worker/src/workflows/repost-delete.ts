import { patched, proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

type RepostDeleteInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const {
  deletePostRelatedNotificationsActivity,
  deleteRepostNotificationActivity,
  invalidateHomeTimelinesActivity,
  removeHomeTimelinePostActivity,
  sendRepostUndoActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function repostDeleteWorkflow({ postId, origin }: RepostDeleteInput): Promise<void> {
  const homeTimelineInvalidationEnabled = patched('repost-delete-home-timeline-invalidation-v1');
  const homeTimelinePostRemovalEnabled = patched('repost-delete-home-timeline-post-removal-v1');
  await settleEffects([
    ...(homeTimelinePostRemovalEnabled
      ? [removeHomeTimelinePostActivity({ postId })]
      : homeTimelineInvalidationEnabled
        ? [invalidateHomeTimelinesActivity()]
        : []),
    patched('repost-delete-related-notifications-v1')
      ? deletePostRelatedNotificationsActivity(postId)
      : deleteRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostUndoActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}
