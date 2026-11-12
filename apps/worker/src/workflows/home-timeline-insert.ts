import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';
import type * as activities from '../activities';

type HomeTimelineInsertInput = {
  readonly postId: string;
  readonly profileId: string;
};

const inputSchema = z.object({
  postId: z.string().min(1),
  profileId: z.string().min(1),
});

const { insertHomeTimelinePostActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function homeTimelineInsertWorkflow(input: HomeTimelineInsertInput): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Home timeline insert input is invalid',
      'HomeTimelineInsertInputInvalid',
    );
  }

  await settleEffects([insertHomeTimelinePostActivity(parsed.data)]);
}

export const homeTimelineInsertWorkflowDefinition: WorkflowDefinition<
  typeof homeTimelineInsertWorkflow
> = {
  workflow: homeTimelineInsertWorkflow,
  workflowIdFromArgs: ({ postId, profileId }) => `home-timeline-insert:${postId}:${profileId}`,
};
