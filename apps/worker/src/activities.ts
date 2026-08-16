import { NotFoundError } from '@kosmo/core/error';
import { createReplyNotification } from '@kosmo/core/services';
import { sendLocalPostCreate } from '@kosmo/fedify';

/**
 * Materialize the notification projection for a committed Post.
 *
 * Root Posts are not Replies, so the shared service reports them as an
 * expected no-op. A deleted or otherwise unavailable Reply is treated the
 * same way; every other error is rethrown for Temporal's Activity retry.
 */
export const createReplyNotificationActivity = async (postId: string): Promise<void> => {
  try {
    await createReplyNotification(postId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return;
    }
    throw error;
  }
};

/**
 * Hand the committed Local Post to the canonical Fedify queue producer.
 * The producer owns Note identity, audience and target selection.
 */
export const sendLocalPostCreateActivity = async (postId: string): Promise<void> => {
  await sendLocalPostCreate(postId);
};
