import { and, asc, desc, gt, inArray, lte, not } from 'drizzle-orm';
import { validate as validateUuid } from 'uuid';
import { getDatabaseConnection, Notifications } from '../db';
import {
  notificationSourceAvailabilityKinds,
  notificationSourceAvailabilityWhere,
} from '../visibility/notification';
import type { DatabaseHandle } from '../db';

export const DEFAULT_NOTIFICATION_CLEANUP_PAGE_SIZE = 100;
export const MAX_NOTIFICATION_CLEANUP_PAGE_SIZE = 1_000;

export type NotificationCleanupPageInput = {
  /** Last processed UUIDv7 ID. The page is strictly greater than this value. */
  readonly cursor?: string | null;
  /**
   * Maximum UUIDv7 ID captured by the caller at sweep start. Page execution
   * never captures this boundary implicitly; callers must pass the same
   * non-null value on every page.
   */
  readonly upperBound: string;
  readonly pageSize?: number;
};

export type NotificationCleanupPageResult = {
  readonly upperBound: string;
  readonly nextCursor: string | null;
  readonly done: boolean;
  readonly scanned: number;
  readonly deleted: number;
  readonly skipped: number;
  /** Age of the oldest deleted unavailable row at page completion, in milliseconds. */
  readonly oldestUnavailableAgeMs: number | null;
};

export class NotificationCleanupInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationCleanupInputError';
  }
}

const validateUuidInput = (value: string | null | undefined, name: string): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!validateUuid(value)) {
    throw new NotificationCleanupInputError(`${name} must be a UUID`);
  }

  return value;
};

const validateRequiredUuidInput = (value: string | null | undefined, name: string): string => {
  if (value === undefined || value === null) {
    throw new NotificationCleanupInputError(`${name} is required`);
  }

  if (!validateUuid(value)) {
    throw new NotificationCleanupInputError(`${name} must be a UUID`);
  }

  return value;
};

const validatePageSize = (pageSize: number | undefined): number => {
  const value = pageSize ?? DEFAULT_NOTIFICATION_CLEANUP_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_NOTIFICATION_CLEANUP_PAGE_SIZE) {
    throw new NotificationCleanupInputError(
      `pageSize must be an integer between 1 and ${MAX_NOTIFICATION_CLEANUP_PAGE_SIZE}`,
    );
  }

  return value;
};

const emptyResult = ({
  upperBound,
}: {
  readonly upperBound: string;
}): NotificationCleanupPageResult => ({
  upperBound,
  nextCursor: null,
  done: true,
  scanned: 0,
  deleted: 0,
  skipped: 0,
  oldestUnavailableAgeMs: null,
});

/** Captures the current maximum Notification UUID for a bounded sweep. */
export const getNotificationCleanupUpperBound = async (
  handle?: DatabaseHandle,
): Promise<string | null> => {
  const connection = getDatabaseConnection(handle);
  const [row] = await connection
    .select({ id: Notifications.id })
    .from(Notifications)
    .orderBy(desc(Notifications.id))
    .limit(1);
  return row?.id ?? null;
};

const oldestInstant = (
  rows: ReadonlyArray<{ readonly createdAt: Temporal.Instant }>,
): Temporal.Instant | null =>
  rows.reduce<Temporal.Instant | null>(
    (oldest, row) =>
      oldest === null || row.createdAt.epochMilliseconds < oldest.epochMilliseconds
        ? row.createdAt
        : oldest,
    null,
  );

const runNotificationCleanupPage = async ({
  cursor,
  upperBound,
  pageSize,
  database,
}: {
  readonly cursor: string | null;
  readonly upperBound: string;
  readonly pageSize: number;
  readonly database: DatabaseHandle;
}): Promise<NotificationCleanupPageResult> => {
  const page = await database
    .select({ id: Notifications.id, createdAt: Notifications.createdAt })
    .from(Notifications)
    .where(
      and(cursor ? gt(Notifications.id, cursor) : undefined, lte(Notifications.id, upperBound)),
    )
    .orderBy(asc(Notifications.id))
    .limit(pageSize);

  if (page.length === 0) {
    return emptyResult({ upperBound });
  }

  const pageIds = page.map(({ id }) => id);
  const deleted = await database
    .delete(Notifications)
    .where(
      and(
        inArray(Notifications.id, pageIds),
        inArray(Notifications.kind, notificationSourceAvailabilityKinds),
        not(
          notificationSourceAvailabilityWhere(database, {
            includeRecipientAvailability: false,
          }),
        ),
      ),
    )
    .returning({ id: Notifications.id, createdAt: Notifications.createdAt });

  const lastId = page[page.length - 1]!.id;
  const hasMore =
    (
      await database
        .select({ id: Notifications.id })
        .from(Notifications)
        .where(and(gt(Notifications.id, lastId), lte(Notifications.id, upperBound)))
        .limit(1)
    ).length > 0;
  const done = !hasMore;
  const oldestUnavailableAt = oldestInstant(deleted);

  return {
    upperBound,
    nextCursor: done ? null : lastId,
    done,
    scanned: page.length,
    deleted: deleted.length,
    skipped: page.length - deleted.length,
    oldestUnavailableAgeMs:
      oldestUnavailableAt === null
        ? null
        : Math.max(0, Date.now() - Number(oldestUnavailableAt.epochMilliseconds)),
  };
};

/**
 * Processes one bounded cleanup page. Scan and delete run in one transaction;
 * the DELETE re-evaluates the current availability predicate by Notification
 * ID, so a row recovered after scanning is preserved.
 */
export const cleanupUnavailableNotificationsPage = async (
  input: NotificationCleanupPageInput,
  handle?: DatabaseHandle,
): Promise<NotificationCleanupPageResult> => {
  const cursor = validateUuidInput(input.cursor, 'cursor');
  const upperBound = validateRequiredUuidInput(input.upperBound, 'upperBound');
  const pageSize = validatePageSize(input.pageSize);
  const connection = getDatabaseConnection(handle);

  return connection.transaction(async (transaction) => {
    return runNotificationCleanupPage({
      cursor,
      upperBound,
      pageSize,
      database: transaction,
    });
  });
};
