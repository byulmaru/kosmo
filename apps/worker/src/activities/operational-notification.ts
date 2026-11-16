import { db, Notifications, withPrimaryDatabase } from '@kosmo/core/db';
import { AccountState, NotificationKind } from '@kosmo/core/enums';
import { publishNotificationAdded } from '@kosmo/core/notification/events';
import { ApplicationFailure } from '@temporalio/activity';
import { and, eq, gt, sql } from 'drizzle-orm';
import { startPushNotificationWorkflow } from './notification';
import type { OperationalNotificationData } from '@kosmo/core/db';

const OPERATIONAL_PAGE_SIZE = 50;

const sameOperationalData = (stored: unknown, expected: OperationalNotificationData) => {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return false;
  }

  const storedRecord = stored as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  const storedKeys = Object.keys(storedRecord).sort();
  const expectedKeys = Object.keys(expectedRecord)
    .filter((key) => expectedRecord[key] !== undefined)
    .sort();

  return (
    storedKeys.length === expectedKeys.length &&
    storedKeys.every(
      (key, index) => key === expectedKeys[index] && storedRecord[key] === expectedRecord[key],
    )
  );
};

/** Captures one durable audience per send; an empty audience creates no marker row. */
export const captureOperationalNotificationAudienceActivity = async ({
  sendId,
  data,
}: {
  readonly sendId: string;
  readonly data: OperationalNotificationData;
}): Promise<boolean> => {
  try {
    const captured = await db.transaction(async (transaction) => {
      const existing = await transaction
        .select({ data: Notifications.data })
        .from(Notifications)
        .where(
          and(
            eq(Notifications.kind, NotificationKind.OPERATIONAL),
            eq(Notifications.sourceId, sendId),
          ),
        )
        .limit(1);
      if (existing.length) {
        return {
          captured: true,
          dataMatches: existing.every(({ data: stored }) => sameOperationalData(stored, data)),
          insertedNotifications: [],
        };
      }

      const inserted = await transaction.execute<{
        notificationId: string;
        recipientAccountId: string;
        recipientProfileId: string | null;
      }>(sql`
        INSERT INTO "notification" ("recipient_account_id", "kind", "source_id", "data")
        SELECT "id", ${NotificationKind.OPERATIONAL}::"notification_kind", ${sendId}::uuid, ${JSON.stringify(data)}::jsonb
        FROM "account"
        WHERE "state" = ${AccountState.ACTIVE}::"account_state"
        RETURNING "id" AS "notificationId", "recipient_account_id" AS "recipientAccountId", "recipient_profile_id" AS "recipientProfileId"
      `);

      return {
        captured: inserted.length > 0,
        dataMatches: true,
        insertedNotifications: inserted,
      };
    });

    if (!captured.dataMatches) {
      throw ApplicationFailure.nonRetryable(
        'Operational notification send ID already exists with different data',
      );
    }

    captured.insertedNotifications.forEach(publishNotificationAdded);

    return captured.captured;
  } catch (error) {
    if (error instanceof ApplicationFailure) {
      throw error;
    }

    const existing = await withPrimaryDatabase(() =>
      db
        .select({ data: Notifications.data })
        .from(Notifications)
        .where(
          and(
            eq(Notifications.kind, NotificationKind.OPERATIONAL),
            eq(Notifications.sourceId, sendId),
          ),
        )
        .limit(1)
        .then((rows) => rows),
    );
    if (existing.length > 0) {
      if (!existing.every(({ data: stored }) => sameOperationalData(stored, data))) {
        throw ApplicationFailure.nonRetryable(
          'Operational notification send ID already exists with different data',
        );
      }

      return true;
    }

    throw error;
  }
};

/** Starts the common push workflow for one stable keyset page of a send. */
export const dispatchOperationalNotificationPageActivity = async ({
  sendId,
  afterNotificationId,
}: {
  readonly sendId: string;
  readonly afterNotificationId?: string;
}): Promise<{ readonly afterNotificationId: string | null; readonly hasMore: boolean }> => {
  const notifications = await withPrimaryDatabase(() =>
    db
      .select({ id: Notifications.id })
      .from(Notifications)
      .where(
        and(
          eq(Notifications.kind, NotificationKind.OPERATIONAL),
          eq(Notifications.sourceId, sendId),
          afterNotificationId ? gt(Notifications.id, afterNotificationId) : undefined,
        ),
      )
      .orderBy(Notifications.id)
      .limit(OPERATIONAL_PAGE_SIZE + 1)
      .then((rows) => rows),
  );

  const page = notifications.slice(0, OPERATIONAL_PAGE_SIZE);

  const starts = await Promise.allSettled(page.map(({ id }) => startPushNotificationWorkflow(id)));
  const failure = starts.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    throw failure.reason;
  }

  return {
    afterNotificationId: page.at(-1)?.id ?? null,
    hasMore: notifications.length > OPERATIONAL_PAGE_SIZE,
  };
};
