import { NotFoundError } from '@kosmo/core/error';
import { createReplyNotification } from '@kosmo/core/services';

/**
 * Materialize the Reply Notification projection for a committed Reply.
 *
 * The source is deliberately the only durable input. The core service reads
 * the current Reply, Parent and Profile state on every attempt, so replay and
 * concurrent execution keep the existing visibility and uniqueness policy.
 * A source that is no longer available is an expected terminal no-op; every
 * other error is rethrown so Temporal can apply its Activity retry policy.
 */
export const createReplyNotificationActivity = async (replyId: string): Promise<void> => {
  try {
    await createReplyNotification(replyId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return;
    }
    throw error;
  }
};
