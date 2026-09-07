import { getDatabaseConnection, Notifications } from '@kosmo/core/db';
import {
  notificationSourceAvailabilityKinds,
  notificationSourceAvailabilityWhere,
} from '@kosmo/core/visibility';
import { activityInfo, log } from '@temporalio/activity';
import { and, asc, inArray, not } from 'drizzle-orm';

const NOTIFICATION_CLEANUP_BATCH_SIZE = 100;

/**
 * Deletes one bounded batch of Notifications whose source or related object
 * is no longer available. Recipient-only inactivity is intentionally excluded
 * from the shared predicate so those rows can be recovered later.
 */
export async function cleanupUnavailableNotificationsActivity(): Promise<void> {
  const { attempt } = activityInfo();
  const startedAt = Date.now();

  try {
    const deleted = await getDatabaseConnection().transaction(async (database) => {
      const unavailable = not(
        notificationSourceAvailabilityWhere(database, {
          includeRecipientAvailability: false,
        }),
      );
      const candidates = await database
        .select({ id: Notifications.id })
        .from(Notifications)
        .where(and(inArray(Notifications.kind, notificationSourceAvailabilityKinds), unavailable))
        .orderBy(asc(Notifications.id))
        .limit(NOTIFICATION_CLEANUP_BATCH_SIZE);

      if (candidates.length === 0) {
        return [];
      }

      return database
        .delete(Notifications)
        .where(
          and(
            inArray(
              Notifications.id,
              candidates.map(({ id }) => id),
            ),
            inArray(Notifications.kind, notificationSourceAvailabilityKinds),
            unavailable,
          ),
        )
        .returning({ id: Notifications.id });
    });

    log.info('Notification cleanup completed', {
      resource: 'notification_cleanup',
      deleted: deleted.length,
      durationMs: Date.now() - startedAt,
      attempt,
    });
  } catch (error) {
    log.error('Notification cleanup failed', {
      resource: 'notification_cleanup',
      durationMs: Date.now() - startedAt,
      attempt,
      error,
    });
    throw error;
  }
}
