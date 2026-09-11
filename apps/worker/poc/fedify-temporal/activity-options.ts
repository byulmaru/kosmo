import type { ActivityOptions } from '@temporalio/workflow';

/**
 * Keep a queue handoff bounded so a failed message cannot hold a keyed
 * Workflow forever. Fedify may enqueue a later attempt separately when its
 * own retry policy requires that, but each Temporal Activity invocation has a
 * finite retry chain here.
 */
export const fedifyTemporalActivityOptions = {
  retry: {
    maximumAttempts: 3,
    initialInterval: '10ms',
    backoffCoefficient: 1,
  },
  startToCloseTimeout: '1 minute',
} satisfies ActivityOptions;
