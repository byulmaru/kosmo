import {
  continueAsNew,
  log,
  metricMeter,
  proxyActivities,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import type * as activities from '../activities';

export type CleanupUnavailableNotificationsWorkflowInput = Readonly<{
  /** Stable correlation key shared by every Continue-As-New run in one sweep. */
  sweepId: string;
  /** Exclusive UUIDv7 cursor. `null` starts at the beginning of the keyspace. */
  cursor?: string | null;
  /** Fixed upper bound captured by the preceding bound Activity. */
  upperBound?: string | null;
  /** Maximum rows scanned by one page Activity. */
  pageSize?: number;
  /** Durable delay between page Activities. */
  rateLimitMs?: number;
  /** Maximum pages executed by one run before Continue-As-New. */
  maxPagesPerRun?: number;
  pages?: number;
  scanned?: number;
  deleted?: number;
  skipped?: number;
  oldestUnavailableAgeMs?: number | null;
}>;

export type CleanupUnavailableNotificationsWorkflowResult = Readonly<{
  sweepId: string;
  cursor: string | null;
  upperBound: string | null;
  done: true;
  pages: number;
  scanned: number;
  deleted: number;
  skipped: number;
  oldestUnavailableAgeMs: number | null;
}>;

type CleanupActivities = Pick<
  typeof activities,
  'cleanupUnavailableNotificationPageActivity' | 'getNotificationCleanupUpperBoundActivity'
>;

const {
  cleanupUnavailableNotificationPageActivity,
  getNotificationCleanupUpperBoundActivity,
}: CleanupActivities = proxyActivities<CleanupActivities>({
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '30 seconds',
    maximumAttempts: 5,
    nonRetryableErrorTypes: [
      'CleanupInvalidInputError',
      'CleanupConfigurationError',
      'CleanupInvalidResultError',
    ],
  },
  scheduleToCloseTimeout: '5 minutes',
  startToCloseTimeout: '30 seconds',
  heartbeatTimeout: '30 seconds',
});

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_RATE_LIMIT_MS = 250;
const DEFAULT_MAX_PAGES_PER_RUN = 100;
// Keep Workflow validation aligned with the core DB page boundary. Rejecting
// the value before scheduling an Activity makes configuration failures
// deterministic and avoids spending an Activity attempt on an invalid page.
const MAX_PAGE_SIZE = 1_000;
const MAX_RATE_LIMIT_MS = 60_000;
const MAX_PAGES_PER_RUN = 10_000;

const metricTags = {
  resource: 'notification_cleanup',
  schedule: 'daily',
} as const;

const createMetrics = () => {
  const meter = metricMeter.withTags(metricTags);
  return {
    pagesCounter: meter.createCounter(
      'notification_cleanup_pages',
      'pages',
      'Number of notification cleanup pages completed',
    ),
    scannedCounter: meter.createCounter(
      'notification_cleanup_scanned',
      'rows',
      'Number of notification rows scanned by cleanup',
    ),
    deletedCounter: meter.createCounter(
      'notification_cleanup_deleted',
      'rows',
      'Number of notification rows deleted by cleanup',
    ),
    skippedCounter: meter.createCounter(
      'notification_cleanup_skipped',
      'rows',
      'Number of notification rows retained by cleanup',
    ),
    errorCounter: meter.createCounter(
      'notification_cleanup_terminal_errors',
      'errors',
      'Number of terminal notification cleanup errors',
    ),
    oldestUnavailableAgeGauge: meter.createGauge(
      'notification_cleanup_oldest_unavailable_age_ms',
      'float',
      'milliseconds',
      'Age of the oldest unavailable notification observed by cleanup',
    ),
    cleanupLagGauge: meter.createGauge(
      'notification_cleanup_lag_ms',
      'float',
      'milliseconds',
      'Observed notification cleanup lag',
    ),
  };
};

const isIntegerInRange = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

const validateInput = (
  input: CleanupUnavailableNotificationsWorkflowInput,
): Required<
  Pick<
    CleanupUnavailableNotificationsWorkflowInput,
    | 'sweepId'
    | 'cursor'
    | 'upperBound'
    | 'pageSize'
    | 'rateLimitMs'
    | 'maxPagesPerRun'
    | 'oldestUnavailableAgeMs'
    | 'pages'
    | 'scanned'
    | 'deleted'
    | 'skipped'
  >
> => {
  if (!input || typeof input.sweepId !== 'string' || input.sweepId.trim().length === 0) {
    throw new Error('CleanupConfigurationError: sweepId is required');
  }

  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const rateLimitMs = input.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  const maxPagesPerRun = input.maxPagesPerRun ?? DEFAULT_MAX_PAGES_PER_RUN;
  if (!isIntegerInRange(pageSize, 1, MAX_PAGE_SIZE)) {
    throw new Error(`CleanupConfigurationError: pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  if (!isIntegerInRange(rateLimitMs, 0, MAX_RATE_LIMIT_MS)) {
    throw new Error(
      `CleanupConfigurationError: rateLimitMs must be between 0 and ${MAX_RATE_LIMIT_MS}`,
    );
  }
  if (!isIntegerInRange(maxPagesPerRun, 1, MAX_PAGES_PER_RUN)) {
    throw new Error(
      `CleanupConfigurationError: maxPagesPerRun must be between 1 and ${MAX_PAGES_PER_RUN}`,
    );
  }

  const pages = input.pages ?? 0;
  const scanned = input.scanned ?? 0;
  const deleted = input.deleted ?? 0;
  const skipped = input.skipped ?? 0;
  if (
    ![pages, scanned, deleted, skipped].every((value) =>
      isIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER),
    )
  ) {
    throw new Error('CleanupConfigurationError: cumulative counters must be non-negative integers');
  }

  const cursor = input.cursor ?? null;
  const upperBound = input.upperBound ?? null;
  if (
    (cursor !== null || pages > 0 || scanned > 0 || deleted > 0 || skipped > 0) &&
    upperBound === null
  ) {
    throw new Error('CleanupConfigurationError: resumed cleanup state requires upperBound');
  }

  return {
    sweepId: input.sweepId,
    cursor,
    upperBound,
    pageSize,
    rateLimitMs,
    maxPagesPerRun,
    pages,
    scanned,
    deleted,
    skipped,
    oldestUnavailableAgeMs: input.oldestUnavailableAgeMs ?? null,
  };
};

export async function cleanupUnavailableNotificationsWorkflow(
  input?: CleanupUnavailableNotificationsWorkflowInput,
): Promise<CleanupUnavailableNotificationsWorkflowResult> {
  // Schedules intentionally use a no-argument action. A run ID uniquely identifies this
  // scheduled execution; Continue-As-New receives the original sweepId in its explicit input.
  const state = validateInput(input ?? { sweepId: workflowInfo().runId });
  const {
    pagesCounter,
    scannedCounter,
    deletedCounter,
    skippedCounter,
    errorCounter,
    oldestUnavailableAgeGauge,
    cleanupLagGauge,
  } = createMetrics();
  let cursor = state.cursor;
  let upperBound = state.upperBound;
  let pages = state.pages;
  let scanned = state.scanned;
  let deleted = state.deleted;
  let skipped = state.skipped;
  let oldestUnavailableAgeMs: number | null = state.oldestUnavailableAgeMs;

  log.info('Notification cleanup sweep started', {
    sweepId: state.sweepId,
    cursor,
    upperBound,
    pageSize: state.pageSize,
    rateLimitMs: state.rateLimitMs,
    pages,
  });

  while (true) {
    let page: Awaited<ReturnType<CleanupActivities['cleanupUnavailableNotificationPageActivity']>>;
    try {
      if (upperBound === null) {
        upperBound = await getNotificationCleanupUpperBoundActivity();
        if (upperBound === null) {
          oldestUnavailableAgeGauge.set(0);
          cleanupLagGauge.set(0);
          log.info('Notification cleanup sweep completed', {
            sweepId: state.sweepId,
            cursor,
            upperBound,
            pages,
            scanned,
            deleted,
            skipped,
            oldestUnavailableAgeMs,
          });
          return {
            sweepId: state.sweepId,
            cursor,
            upperBound,
            done: true,
            pages,
            scanned,
            deleted,
            skipped,
            oldestUnavailableAgeMs,
          };
        }
      }

      page = await cleanupUnavailableNotificationPageActivity({
        cursor,
        upperBound,
        pageSize: state.pageSize,
      });
    } catch (error) {
      errorCounter.add(1);
      log.error('Notification cleanup Activity failed', {
        sweepId: state.sweepId,
        cursor,
        upperBound,
        page: pages + 1,
        error,
      });
      throw error;
    }

    pages += 1;
    scanned += page.scanned;
    deleted += page.deleted;
    skipped += page.skipped;
    cursor = page.nextCursor;
    upperBound = page.upperBound;
    if (
      page.oldestUnavailableAgeMs !== null &&
      (oldestUnavailableAgeMs === null || page.oldestUnavailableAgeMs > oldestUnavailableAgeMs)
    ) {
      oldestUnavailableAgeMs = page.oldestUnavailableAgeMs;
    }

    pagesCounter.add(1);
    scannedCounter.add(page.scanned);
    deletedCounter.add(page.deleted);
    skippedCounter.add(page.skipped);
    if (oldestUnavailableAgeMs !== null) {
      oldestUnavailableAgeGauge.set(oldestUnavailableAgeMs);
      cleanupLagGauge.set(oldestUnavailableAgeMs);
    }

    log.info('Notification cleanup page completed', {
      sweepId: state.sweepId,
      cursor,
      upperBound,
      page: pages,
      scanned: page.scanned,
      deleted: page.deleted,
      skipped: page.skipped,
      done: page.done,
      oldestUnavailableAgeMs: page.oldestUnavailableAgeMs,
    });

    if (page.done) {
      oldestUnavailableAgeGauge.set(0);
      cleanupLagGauge.set(0);
      log.info('Notification cleanup sweep completed', {
        sweepId: state.sweepId,
        cursor,
        upperBound,
        pages,
        scanned,
        deleted,
        skipped,
        oldestUnavailableAgeMs,
      });
      return {
        sweepId: state.sweepId,
        cursor,
        upperBound,
        done: true,
        pages,
        scanned,
        deleted,
        skipped,
        oldestUnavailableAgeMs,
      };
    }

    if (workflowInfo().continueAsNewSuggested || pages - state.pages >= state.maxPagesPerRun) {
      log.info('Notification cleanup sweep continuing as new', {
        sweepId: state.sweepId,
        cursor,
        upperBound,
        pages,
        scanned,
        deleted,
        skipped,
        oldestUnavailableAgeMs,
      });
      await continueAsNew<typeof cleanupUnavailableNotificationsWorkflow>({
        sweepId: state.sweepId,
        cursor,
        upperBound,
        pageSize: state.pageSize,
        rateLimitMs: state.rateLimitMs,
        maxPagesPerRun: state.maxPagesPerRun,
        pages,
        scanned,
        deleted,
        skipped,
        oldestUnavailableAgeMs,
      });
    }

    if (state.rateLimitMs > 0) {
      await sleep(state.rateLimitMs);
    }
  }
}

/** Stable schedule-facing name. Keep the descriptive name above for direct/manual starts. */
export const notificationCleanupWorkflow = cleanupUnavailableNotificationsWorkflow;
