import {
  cleanupUnavailableNotificationsPage,
  getNotificationCleanupUpperBound,
} from '@kosmo/core/services';
import { activityInfo, heartbeat, log, metricMeter } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/client';

/**
 * The page boundary is intentionally transport-neutral. The implementation lives in core so
 * GraphQL visibility and cleanup share the same source/related-object predicate; this module
 * only supplies Temporal lifecycle and observability behavior.
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

const metricTags = {
  resource: 'notification_cleanup',
  schedule: 'daily',
} as const;

const nonNegativeInteger = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`CleanupInvalidResultError: ${name} must be a non-negative integer`);
  }
  return value;
};

const optionalNonNegativeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      'CleanupInvalidResultError: oldestUnavailableAgeMs must be a non-negative number or null',
    );
  }
  return value;
};

const normalizePageResult = (
  input: CleanupUnavailableNotificationPageInput,
  raw: unknown,
): CleanupUnavailableNotificationPageResult => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('CleanupInvalidResultError: core returned an invalid page result');
  }
  const result = raw as Record<string, unknown>;
  const upperBound = result.upperBound;
  const nextCursor = result.nextCursor ?? null;
  if (typeof upperBound !== 'string') {
    throw new Error('CleanupInvalidResultError: upperBound must be a string');
  }
  if (upperBound !== input.upperBound) {
    throw new Error('CleanupInvalidResultError: upperBound changed during a bounded sweep');
  }
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    throw new Error('CleanupInvalidResultError: nextCursor must be a string or null');
  }
  if (typeof result.done !== 'boolean') {
    throw new Error('CleanupInvalidResultError: done must be boolean');
  }
  const page = {
    upperBound,
    nextCursor,
    done: result.done,
    scanned: nonNegativeInteger(result.scanned, 'scanned'),
    deleted: nonNegativeInteger(result.deleted, 'deleted'),
    skipped: nonNegativeInteger(result.skipped, 'skipped'),
    oldestUnavailableAgeMs: optionalNonNegativeNumber(result.oldestUnavailableAgeMs),
  } satisfies CleanupUnavailableNotificationPageResult;
  if (page.done !== (page.nextCursor === null)) {
    throw new Error('CleanupInvalidResultError: done must match the presence of nextCursor');
  }
  if (!page.done && page.nextCursor === input.cursor) {
    throw new Error('CleanupInvalidResultError: non-final page did not advance cursor');
  }
  return page;
};

/**
 * Scan and conditionally delete one bounded Notification page.
 *
 * Core owns the transaction, source/recipient/related availability predicate and delete
 * revalidation. This wrapper owns retry-visible progress and structured observability only.
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
    const page = normalizePageResult(input, await cleanupUnavailableNotificationsPage(input));
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
        : error instanceof Error && error.message.startsWith('CleanupInvalid')
          ? ApplicationFailure.nonRetryable(error.message, 'CleanupInvalidResultError')
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
    const upperBound = await getNotificationCleanupUpperBound();
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
