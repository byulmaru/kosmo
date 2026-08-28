import type { ActivityOptions } from '@temporalio/workflow';

export const workflowActivityOptions = {
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
} satisfies ActivityOptions;
