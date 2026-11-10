import { NotificationKind } from '@kosmo/core/enums';
import { publishNotificationAdded } from '@kosmo/core/notification/events';
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
import type { NotificationEventCollector } from '@kosmo/core/notification/events';

type CreateNotificationInput = {
  readonly kind: Exclude<NotificationKind, 'OPERATIONAL'>;
  readonly sourceId: string;
};

export const startPushNotificationWorkflow = async (notificationId: string): Promise<void> => {
  try {
    await runWorkflow(pushNotificationWorkflow, {
      mode: 'start',
      args: [{ notificationId }],
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  } catch (error: unknown) {
    if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
      throw error;
    }
  }
};

const materializeWithNotificationEvents = async (
  materialize: (eventCollector: NotificationEventCollector) => Promise<string[]>,
): Promise<string[]> => {
  const eventCollector: NotificationEventCollector = [];
  const notificationIds = await materialize(eventCollector);
  eventCollector.forEach(publishNotificationAdded);
  return notificationIds;
};

export const createFollowNotificationActivity = (sourceId: string): Promise<string[]> =>
  materializeWithNotificationEvents((eventCollector) =>
    createFollowNotification(sourceId, eventCollector),
  );

export const createFollowRequestNotificationActivity = (sourceId: string): Promise<string[]> =>
  materializeWithNotificationEvents((eventCollector) =>
    createFollowRequestNotification(sourceId, eventCollector),
  );

export const createReactionNotificationActivity = (sourceId: string): Promise<string[]> =>
  materializeWithNotificationEvents((eventCollector) =>
    createReactionNotification(sourceId, undefined, eventCollector),
  );

export const createRepostNotificationActivity = (sourceId: string): Promise<string[]> =>
  materializeWithNotificationEvents((eventCollector) =>
    createRepostNotification(sourceId, undefined, eventCollector),
  );

export const createReplyNotificationActivity = (sourceId: string): Promise<string[]> =>
  materializeWithNotificationEvents((eventCollector) =>
    createReplyNotification(sourceId, eventCollector),
  );

export const createQuoteNotificationActivity = (sourceId: string): Promise<string[]> =>
  materializeWithNotificationEvents((eventCollector) =>
    createQuoteNotification(sourceId, undefined, eventCollector),
  );

export const createMentionNotificationActivity = (sourceId: string): Promise<string[]> =>
  materializeWithNotificationEvents((eventCollector) =>
    createMentionNotification(sourceId, undefined, eventCollector),
  );

export async function createNotificationActivity({
  kind,
  sourceId,
}: CreateNotificationInput): Promise<void> {
  const materialized = await match(kind)
    .with(NotificationKind.FOLLOW, () => createFollowNotificationActivity(sourceId))
    .with(NotificationKind.FOLLOW_REQUEST, () => createFollowRequestNotificationActivity(sourceId))
    .with(NotificationKind.REACTION, () => createReactionNotificationActivity(sourceId))
    .with(NotificationKind.REPOST, () => createRepostNotificationActivity(sourceId))
    .with(NotificationKind.REPLY, () => createReplyNotificationActivity(sourceId))
    .with(NotificationKind.QUOTE, () => createQuoteNotificationActivity(sourceId))
    .with(NotificationKind.MENTION, () => createMentionNotificationActivity(sourceId))
    .exhaustive();
  await Promise.all(
    materialized.map(async (notificationId) => {
      try {
        await startPushNotificationWorkflow(notificationId);
      } catch (error: unknown) {
        log.error('Push notification workflow failed to start', {
          notificationId,
          error,
        });
      }
    }),
  );
}
