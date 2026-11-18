import { db } from '../db';
import { materializeReplyNotificationIfEligible } from './quote-notification-coordination';
import type { NotificationEventCollector } from '../notification/events';

/**
 * Materialize the notification projection for a committed Post.
 *
 * Root Posts, missing Posts and unavailable Replies are expected no-ops;
 * database failures are rethrown for the caller's retry boundary.
 */
export const createReplyNotification = async (
  postId: string,
  eventCollector?: NotificationEventCollector,
): Promise<string[]> =>
  db.transaction(async (tx) => {
    const result = await materializeReplyNotificationIfEligible(tx, postId, eventCollector);
    return result?.notificationIds ?? [];
  });
