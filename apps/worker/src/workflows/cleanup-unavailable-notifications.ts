import {
  continueAsNew,
  log,
  metricMeter,
  proxyActivities,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import { z } from 'zod';
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
const PAGE_SIZE_ERROR = `pageSize must be between 1 and ${MAX_PAGE_SIZE}`;
const RATE_LIMIT_ERROR = `rateLimitMs must be between 0 and ${MAX_RATE_LIMIT_MS}`;
const MAX_PAGES_ERROR = `maxPagesPerRun must be between 1 and ${MAX_PAGES_PER_RUN}`;
const COUNTERS_ERROR = 'cumulative counters must be non-negative integers';

const defaultNumber = (schema: z.ZodNumber, value: number) =>
  z.preprocess((input) => input ?? undefined, schema.optional().default(value));
const integerInRange = (message: string, min: number, max: number) =>
  z
    .number({ error: message })
    .int({ error: message })
    .min(min, { error: message })
    .max(max, { error: message });
const nonNegativeCounterSchema = integerInRange(COUNTERS_ERROR, 0, Number.MAX_SAFE_INTEGER);

const cleanupUnavailableNotificationsWorkflowInputSchema = z
  .object({
    sweepId: z
      .string({ error: 'sweepId is required' })
      .refine((value) => value.trim().length > 0, { error: 'sweepId is required' }),
    cursor: z.string().nullable().optional().default(null),
    upperBound: z.string().nullable().optional().default(null),
    pageSize: defaultNumber(integerInRange(PAGE_SIZE_ERROR, 1, MAX_PAGE_SIZE), DEFAULT_PAGE_SIZE),
    rateLimitMs: defaultNumber(
      integerInRange(RATE_LIMIT_ERROR, 0, MAX_RATE_LIMIT_MS),
      DEFAULT_RATE_LIMIT_MS,
    ),
    maxPagesPerRun: defaultNumber(
      integerInRange(MAX_PAGES_ERROR, 1, MAX_PAGES_PER_RUN),
      DEFAULT_MAX_PAGES_PER_RUN,
    ),
    pages: defaultNumber(nonNegativeCounterSchema, 0),
    scanned: defaultNumber(nonNegativeCounterSchema, 0),
    deleted: defaultNumber(nonNegativeCounterSchema, 0),
    skipped: defaultNumber(nonNegativeCounterSchema, 0),
  })
  .superRefine((input, context) => {
    if (
      (input.cursor !== null ||
        input.pages > 0 ||
        input.scanned > 0 ||
        input.deleted > 0 ||
        input.skipped > 0) &&
      input.upperBound === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['upperBound'],
        message: 'resumed cleanup state requires upperBound',
      });
    }
  });

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
  };
};

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
    | 'pages'
    | 'scanned'
    | 'deleted'
    | 'skipped'
  >
> => {
  const parsedInput = cleanupUnavailableNotificationsWorkflowInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    const message =
      issue?.path.length === 0 ? 'sweepId is required' : (issue?.message ?? 'invalid input');
    throw new Error(`CleanupConfigurationError: ${message}`);
  }

  return parsedInput.data;
};

export async function cleanupUnavailableNotificationsWorkflow(
  input?: CleanupUnavailableNotificationsWorkflowInput,
): Promise<CleanupUnavailableNotificationsWorkflowResult> {
  // Schedules intentionally use a no-argument action. A run ID uniquely identifies this
  // scheduled execution; Continue-As-New receives the original sweepId in its explicit input.
  const state = validateInput(input ?? { sweepId: workflowInfo().runId });
  const { pagesCounter, scannedCounter, deletedCounter, skippedCounter, errorCounter } =
    createMetrics();
  let cursor = state.cursor;
  let upperBound = state.upperBound;
  let pages = state.pages;
  let scanned = state.scanned;
  let deleted = state.deleted;
  let skipped = state.skipped;

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
          log.info('Notification cleanup sweep completed', {
            sweepId: state.sweepId,
            cursor,
            upperBound,
            pages,
            scanned,
            deleted,
            skipped,
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

    pagesCounter.add(1);
    scannedCounter.add(page.scanned);
    deletedCounter.add(page.deleted);
    skippedCounter.add(page.skipped);

    log.info('Notification cleanup page completed', {
      sweepId: state.sweepId,
      cursor,
      upperBound,
      page: pages,
      scanned: page.scanned,
      deleted: page.deleted,
      skipped: page.skipped,
      done: page.done,
    });

    if (page.done) {
      log.info('Notification cleanup sweep completed', {
        sweepId: state.sweepId,
        cursor,
        upperBound,
        pages,
        scanned,
        deleted,
        skipped,
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
      };
    }

    if (state.rateLimitMs > 0) {
      await sleep(state.rateLimitMs);
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
      });
    }
  }
}

/** Stable schedule-facing name. Keep the descriptive name above for direct/manual starts. */
export const notificationCleanupWorkflow = cleanupUnavailableNotificationsWorkflow;
