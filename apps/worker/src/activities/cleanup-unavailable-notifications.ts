import { getDatabaseConnection, Notifications } from '@kosmo/core/db';
import {
  notificationSourceAvailabilityKinds,
  notificationSourceAvailabilityWhere,
} from '@kosmo/core/visibility';
import {
  activityInfo,
  ApplicationFailure,
  heartbeat,
  log,
  metricMeter,
} from '@temporalio/activity';
import { and, asc, desc, gt, inArray, lte, not } from 'drizzle-orm';
import { z } from 'zod';

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
}>;

const MAX_NOTIFICATION_CLEANUP_PAGE_SIZE = 1_000;
const PAGE_SIZE_ERROR = `pageSize must be an integer between 1 and ${MAX_NOTIFICATION_CLEANUP_PAGE_SIZE}`;

const uuidSchema = (name: string, required: boolean) =>
  z
    .string({
      error: (issue) =>
        required && (issue.input === null || issue.input === undefined)
          ? `${name} is required`
          : `${name} must be a UUID`,
    })
    .uuid({ error: `${name} must be a UUID` });

const cleanupUnavailableNotificationPageInputSchema = z.object({
  cursor: uuidSchema('cursor', false).nullable().optional().default(null),
  upperBound: uuidSchema('upperBound', true),
  pageSize: z
    .number({ error: PAGE_SIZE_ERROR })
    .int({ error: PAGE_SIZE_ERROR })
    .min(1, { error: PAGE_SIZE_ERROR })
    .max(MAX_NOTIFICATION_CLEANUP_PAGE_SIZE, { error: PAGE_SIZE_ERROR }),
});

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
  const validation = cleanupUnavailableNotificationPageInputSchema.safeParse(input);

  try {
    if (!validation.success) {
      const issue = validation.error.issues[0];
      const message = issue?.path.length === 0 ? 'Invalid cleanup input' : issue?.message;
      throw ApplicationFailure.nonRetryable(
        message ?? 'Invalid cleanup input',
        'CleanupInvalidInputError',
      );
    }
    const { cursor, upperBound, pageSize } = validation.data;
    heartbeat({ phase: 'started', cursor, upperBound, attempt });
    log.info('Notification cleanup page started', {
      resource: 'notification_cleanup',
      schedule: 'daily',
      cursor,
      upperBound,
      pageSize,
      attempt,
    });
    const page = await getDatabaseConnection().transaction(async (database) => {
      const lookaheadRows = await database
        .select({ id: Notifications.id })
        .from(Notifications)
        .where(
          and(cursor ? gt(Notifications.id, cursor) : undefined, lte(Notifications.id, upperBound)),
        )
        .orderBy(asc(Notifications.id))
        .limit(pageSize + 1);
      const rows = lookaheadRows.slice(0, pageSize);

      if (rows.length === 0) {
        return {
          upperBound,
          nextCursor: null,
          done: true,
          scanned: 0,
          deleted: 0,
          skipped: 0,
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
        .returning({ id: Notifications.id });

      const lastId = rows[rows.length - 1]!.id;
      const done = lookaheadRows.length <= pageSize;

      return {
        upperBound,
        nextCursor: done ? null : lastId,
        done,
        scanned: rows.length,
        deleted: deleted.length,
        skipped: rows.length - deleted.length,
      } satisfies CleanupUnavailableNotificationPageResult;
    });
    const durationMs = Date.now() - startedAt;
    heartbeat({
      phase: 'completed',
      cursor,
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
      cursor,
      upperBound: page.upperBound,
      nextCursor: page.nextCursor,
      done: page.done,
      scanned: page.scanned,
      deleted: page.deleted,
      skipped: page.skipped,
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
    log.error('Notification cleanup page failed', {
      resource: 'notification_cleanup',
      schedule: 'daily',
      ...(validation.success
        ? { cursor: validation.data.cursor, upperBound: validation.data.upperBound }
        : {}),
      durationMs,
      attempt,
      error,
    });
    metricMeter
      .withTags(metricTags)
      .createCounter(
        'notification_cleanup_activity_attempt_errors',
        'errors',
        'Number of notification cleanup Activity attempts that failed',
      )
      .add(1);
    throw error;
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
