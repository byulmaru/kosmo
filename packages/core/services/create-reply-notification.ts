import { db } from '../db';
import { materializeReplyNotificationIfEligible } from './quote-notification-coordination';

/**
 * Materialize the notification projection for a committed Post.
 *
 * Root Posts, missing Posts and unavailable Replies are expected no-ops;
 * database failures are rethrown for the caller's retry boundary.
 */
export const createReplyNotification = async (postId: string): Promise<string | null> =>
  db.transaction(async (tx) => {
    const result = await materializeReplyNotificationIfEligible(tx, postId);
    return result?.notificationId ?? null;
  });
