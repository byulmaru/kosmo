import { getDatabaseConnection, Notifications } from '@kosmo/core/db';
import {
  notificationSourceAvailabilityKinds,
  notificationSourceAvailabilityWhere,
} from '@kosmo/core/visibility';
import { activityInfo, heartbeat, log, metricMeter } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/client';
import { and, asc, desc, gt, inArray, lte, not } from 'drizzle-orm';
import { validate as validateUuid } from 'uuid';

/**
 * The page boundary is intentionally transport-neutral. The Worker owns the
 * cleanup persistence boundary and consumes the shared viewer-independent
 * source/related-object predicate from core visibility.
 */
export type CleanupUnavailableNotificationPageInput = Readonly<{
  /** Exclusive UUIDv7 cursor. `null` starts at the beginning of the keyspace. */
  cursor: string | null;
  /** Fixed sweep upper bound captured by the preceding bound Activity. */
  upperBound: string;
  /** Maximum rows scanned by this Activity. */
  pageSize: number;
}>;

export type CleanupUnavailableNotificationPageResult = Readonly<{
  upperBound: string;
  nextCursor: string | null;
  done: boolean;
  scanned: number;
  deleted: number;
  skipped: number;
  oldestUnavailableAgeMs: number | null;
}>;

const MAX_NOTIFICATION_CLEANUP_PAGE_SIZE = 1_000;

class NotificationCleanupInputError extends Error {
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

const validatePageSize = (pageSize: number): number => {
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_NOTIFICATION_CLEANUP_PAGE_SIZE
  ) {
    throw new NotificationCleanupInputError(
      `pageSize must be an integer between 1 and ${MAX_NOTIFICATION_CLEANUP_PAGE_SIZE}`,
    );
  }

  return pageSize;
};

const metricTags = {
  resource: 'notification_cleanup',
  schedule: 'daily',
} as const;

/**
 * Scan and conditionally delete one bounded Notification page.
 *
 * This Activity owns the database transaction and delete revalidation. The
 * shared core visibility module owns only the viewer-independent predicate.
 */
export async function cleanupUnavailableNotificationPageActivity(
  input: CleanupUnavailableNotificationPageInput,
): Promise<CleanupUnavailableNotificationPageResult> {
  const { attempt } = activityInfo();
  const startedAt = Date.now();
  heartbeat({
    phase: 'started',
    cursor: input.cursor,
    upperBound: input.upperBound,
    attempt,
  });
  log.info('Notification cleanup page started', {
    resource: 'notification_cleanup',
    schedule: 'daily',
    cursor: input.cursor,
    upperBound: input.upperBound,
    pageSize: input.pageSize,
    attempt,
  });

  try {
    const cursor = validateUuidInput(input.cursor, 'cursor');
    const upperBound = validateRequiredUuidInput(input.upperBound, 'upperBound');
    const pageSize = validatePageSize(input.pageSize);
    const page = await getDatabaseConnection().transaction(async (database) => {
      const rows = await database
        .select({ id: Notifications.id, createdAt: Notifications.createdAt })
        .from(Notifications)
        .where(
          and(cursor ? gt(Notifications.id, cursor) : undefined, lte(Notifications.id, upperBound)),
        )
        .orderBy(asc(Notifications.id))
        .limit(pageSize);

      if (rows.length === 0) {
        return {
          upperBound,
          nextCursor: null,
          done: true,
          scanned: 0,
          deleted: 0,
          skipped: 0,
          oldestUnavailableAgeMs: null,
        } satisfies CleanupUnavailableNotificationPageResult;
      }

      const deleted = await database
        .delete(Notifications)
        .where(
          and(
            inArray(
              Notifications.id,
              rows.map(({ id }) => id),
            ),
            inArray(Notifications.kind, notificationSourceAvailabilityKinds),
            not(
              notificationSourceAvailabilityWhere(database, {
                includeRecipientAvailability: false,
              }),
            ),
          ),
        )
        .returning({ id: Notifications.id, createdAt: Notifications.createdAt });

      const lastId = rows[rows.length - 1]!.id;
      const hasMore =
        (
          await database
            .select({ id: Notifications.id })
            .from(Notifications)
            .where(and(gt(Notifications.id, lastId), lte(Notifications.id, upperBound)))
            .limit(1)
        ).length > 0;
      const done = !hasMore;
      const oldestUnavailableAt = deleted.reduce<number | null>((oldest, row) => {
        const epochMilliseconds = Number(row.createdAt.epochMilliseconds);
        return oldest === null || epochMilliseconds < oldest ? epochMilliseconds : oldest;
      }, null);

      return {
        upperBound,
        nextCursor: done ? null : lastId,
        done,
        scanned: rows.length,
        deleted: deleted.length,
        skipped: rows.length - deleted.length,
        oldestUnavailableAgeMs:
          oldestUnavailableAt === null ? null : Math.max(0, Date.now() - oldestUnavailableAt),
      } satisfies CleanupUnavailableNotificationPageResult;
    });
    const durationMs = Date.now() - startedAt;
    heartbeat({
      phase: 'completed',
      cursor: input.cursor,
      upperBound: page.upperBound,
      nextCursor: page.nextCursor,
      attempt,
      scanned: page.scanned,
      deleted: page.deleted,
      skipped: page.skipped,
    });
    log.info('Notification cleanup page completed', {
      resource: 'notification_cleanup',
      schedule: 'daily',
      cursor: input.cursor,
      upperBound: page.upperBound,
      nextCursor: page.nextCursor,
      done: page.done,
      scanned: page.scanned,
      deleted: page.deleted,
      skipped: page.skipped,
      oldestUnavailableAgeMs: page.oldestUnavailableAgeMs,
      durationMs,
      attempt,
    });
    // Logical page/row counters are emitted by the replay-safe Workflow after
    // it accepts the Activity result. Emitting them here as well would double
    // count every successful page and over-count result-loss retries.
    metricMeter
      .withTags(metricTags)
      .createHistogram(
        'notification_cleanup_page_duration',
        'float',
        'milliseconds',
        'Notification cleanup page duration',
      )
      .record(durationMs);
    return page;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const normalizedError =
      error instanceof Error && error.name === 'NotificationCleanupInputError'
        ? ApplicationFailure.nonRetryable(error.message, 'CleanupInvalidInputError')
        : error;
    log.error('Notification cleanup page failed', {
      resource: 'notification_cleanup',
      schedule: 'daily',
      cursor: input.cursor,
      upperBound: input.upperBound,
      durationMs,
      attempt,
      error: normalizedError,
    });
    metricMeter
      .withTags(metricTags)
      .createCounter(
        'notification_cleanup_activity_attempt_errors',
        'errors',
        'Number of notification cleanup Activity attempts that failed',
      )
      .add(1);
    throw normalizedError;
  }
}

export async function getNotificationCleanupUpperBoundActivity(): Promise<string | null> {
  const { attempt } = activityInfo();
  const startedAt = Date.now();
  heartbeat({ phase: 'started', attempt });
  log.info('Notification cleanup upper bound started', {
    resource: 'notification_cleanup',
    schedule: 'daily',
    attempt,
  });

  try {
    const [row] = await getDatabaseConnection()
      .select({ id: Notifications.id })
      .from(Notifications)
      .orderBy(desc(Notifications.id))
      .limit(1);
    const upperBound = row?.id ?? null;
    heartbeat({ phase: 'completed', upperBound, attempt });
    log.info('Notification cleanup upper bound completed', {
      resource: 'notification_cleanup',
      schedule: 'daily',
      upperBound,
      durationMs: Date.now() - startedAt,
      attempt,
    });
    return upperBound;
  } catch (error) {
    log.error('Notification cleanup upper bound failed', {
      resource: 'notification_cleanup',
      schedule: 'daily',
      durationMs: Date.now() - startedAt,
      attempt,
      error,
    });
    throw error;
  }
}
