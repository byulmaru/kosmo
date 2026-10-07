import { db, Notifications } from '@kosmo/core/db';
import { AccountState, NotificationKind } from '@kosmo/core/enums';
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
        );
      if (existing.length) {
        return {
          captured: true,
          dataMatches: existing.every(({ data: stored }) => sameOperationalData(stored, data)),
        };
      }

      const inserted = await transaction.execute(sql`
        INSERT INTO "notification" ("recipient_account_id", "kind", "source_id", "data")
        SELECT "id", ${NotificationKind.OPERATIONAL}::"notification_kind", ${sendId}::uuid, ${JSON.stringify(data)}::jsonb
        FROM "account"
        WHERE "state" = ${AccountState.ACTIVE}::"account_state"
        RETURNING "id"
      `);

      return { captured: inserted.length > 0, dataMatches: true };
    });

    if (!captured.dataMatches) {
      throw ApplicationFailure.nonRetryable(
        'Operational notification send ID already exists with different data',
      );
    }

    return captured.captured;
  } catch (error) {
    if (error instanceof ApplicationFailure) {
      throw error;
    }

    const existing = await db
      .select({ data: Notifications.data })
      .from(Notifications)
      .where(
        and(
          eq(Notifications.kind, NotificationKind.OPERATIONAL),
          eq(Notifications.sourceId, sendId),
        ),
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
  const notifications = await db
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
    .limit(OPERATIONAL_PAGE_SIZE);

  const starts = await Promise.allSettled(
    notifications.map(({ id }) => startPushNotificationWorkflow(id)),
  );
  const failure = starts.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    throw failure.reason;
  }

  return {
    afterNotificationId: notifications.at(-1)?.id ?? null,
    hasMore: notifications.length === OPERATIONAL_PAGE_SIZE,
  };
};
