import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';
import type * as activities from '../activities';

export const homeTimelineInsertBatchSize = 100;

type HomeTimelineInsertBatchInput = {
  readonly fanoutRunId: string;
  readonly postId: string;
  readonly profileIds: readonly string[];
};

const inputSchema = z.object({
  fanoutRunId: z.string().min(1),
  postId: z.string().min(1),
  profileIds: z.array(z.string().min(1)).min(1).max(homeTimelineInsertBatchSize),
});

const { insertHomeTimelinePostBatchActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function homeTimelineInsertBatchWorkflow(
  input: HomeTimelineInsertBatchInput,
): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Home timeline insert batch input is invalid',
      'HomeTimelineInsertBatchInputInvalid',
    );
  }

  await settleEffects([
    insertHomeTimelinePostBatchActivity({
      postId: parsed.data.postId,
      profileIds: parsed.data.profileIds,
    }),
  ]);
}

export const homeTimelineInsertBatchWorkflowDefinition: WorkflowDefinition<
  typeof homeTimelineInsertBatchWorkflow
> = {
  workflow: homeTimelineInsertBatchWorkflow,
  workflowIdFromArgs: ({ fanoutRunId, postId, profileIds }) =>
    `home-timeline-insert-batch:${postId}:${fanoutRunId}:${profileIds[0]}:${profileIds.at(-1)}`,
};
