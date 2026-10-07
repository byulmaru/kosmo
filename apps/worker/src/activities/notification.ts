import { NotificationKind } from '@kosmo/core/enums';
import {
  createFollowNotification,
  createFollowRequestNotification,
  createMentionNotification,
  createQuoteNotification,
  createReactionNotification,
  createReplyNotification,
  createRepostNotification,
} from '@kosmo/core/services';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { pushNotificationWorkflow } from '@kosmo/core/temporal/push-notification';
import { log } from '@temporalio/activity';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { match } from 'ts-pattern';

type CreateNotificationInput = {
  readonly kind: Exclude<NotificationKind, 'OPERATIONAL'>;
  readonly sourceId: string;
};

export async function createNotificationActivity({
  kind,
  sourceId,
}: CreateNotificationInput): Promise<void> {
  const materialized = await match(kind)
    .with(NotificationKind.FOLLOW, () => createFollowNotification(sourceId))
    .with(NotificationKind.FOLLOW_REQUEST, () => createFollowRequestNotification(sourceId))
    .with(NotificationKind.REACTION, () => createReactionNotification(sourceId))
    .with(NotificationKind.REPOST, () => createRepostNotification(sourceId))
    .with(NotificationKind.REPLY, () => createReplyNotification(sourceId))
    .with(NotificationKind.QUOTE, () => createQuoteNotification(sourceId))
    .with(NotificationKind.MENTION, () => createMentionNotification(sourceId))
    .exhaustive();
  const notificationIds = typeof materialized === 'string' ? [materialized] : (materialized ?? []);

  await Promise.all(
    notificationIds.map(async (notificationId) => {
      try {
        await runWorkflow(pushNotificationWorkflow, {
          mode: 'start',
          args: [{ notificationId }],
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
          workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        });
      } catch (error: unknown) {
        if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
          log.error('Push notification workflow failed to start', {
            notificationId,
            error,
          });
        }
      }
    }),
  );
}
