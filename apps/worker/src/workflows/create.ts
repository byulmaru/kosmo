import { NotificationKind } from '@kosmo/core/enums';
import { patched, proxyActivities } from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from './activity-options';
import { startHomeTimelineFanout } from './home-timeline-fanout';
import { settleEffects } from './settle-effects';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';
import type { PostAnalyticsPlatform } from '@kosmo/core/temporal/post-create';
import type * as activities from '../activities';

type PostCreateEffectsInput = {
  readonly analyticsPlatform?: PostAnalyticsPlatform;
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const {
  createNotificationActivity,
  createQuoteNotificationActivity,
  createMentionNotificationActivity,
  createReplyNotificationActivity,
  capturePostCreatedActivity,
  fanoutHomeTimelinePostActivity,
  sendLocalPostCreateActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postCreateEffectsWorkflow({
  analyticsPlatform,
  postId,
  origin,
}: PostCreateEffectsInput): Promise<void> {
  const pushNotificationDispatchEnabled = patched('post-create-effects-push-notification-v1');
  const mentionNotificationEnabled = patched('post-create-effects-mention-notification-v1');
  const postCreatedAnalyticsEnabled = patched('post-create-effects-post-created-analytics-v1');
  const homeTimelineFanoutEnabled = patched('post-create-effects-home-timeline-fanout-v1');
  const homeTimelineFanoutChildEnabled = patched(
    'post-create-effects-home-timeline-child-fanout-v1',
  );
  await settleEffects([
    ...(homeTimelineFanoutChildEnabled
      ? [startHomeTimelineFanout(postId)]
      : homeTimelineFanoutEnabled
        ? [fanoutHomeTimelinePostActivity({ postId })]
        : []),
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
    ...(mentionNotificationEnabled
      ? [
          pushNotificationDispatchEnabled
            ? createNotificationActivity({ kind: NotificationKind.MENTION, sourceId: postId })
            : createMentionNotificationActivity(postId),
        ]
      : []),
    ...match(origin)
      .with('LOCAL', () => [
        sendLocalPostCreateActivity(postId),
        ...(postCreatedAnalyticsEnabled && analyticsPlatform !== undefined
          ? [capturePostCreatedActivity({ analyticsPlatform, postId })]
          : []),
      ])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}

export const postCreateEffectsDefinition: WorkflowDefinition<typeof postCreateEffectsWorkflow> = {
  workflow: postCreateEffectsWorkflow,
  workflowIdFromArgs: ({ postId }) => `post-create-effects:${postId}`,
};
