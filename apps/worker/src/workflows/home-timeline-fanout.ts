import {
  ApplicationFailure,
  ChildWorkflowCancellationType,
  continueAsNew,
  ParentClosePolicy,
  proxyActivities,
  WorkflowIdReusePolicy,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import { homeTimelineInsertWorkflowDefinition } from './home-timeline-insert';
import { settleEffects } from './settle-effects';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';
import type * as activities from '../activities';

type HomeTimelineFanoutInput = {
  readonly postId: string;
  readonly afterProfileId?: string;
};

const inputSchema = z.object({
  postId: z.string().min(1),
  afterProfileId: z.string().min(1).optional(),
});

const { loadHomeTimelineRecipientPageActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function startHomeTimelineFanout(postId: string): Promise<void> {
  try {
    await runChildWorkflow(homeTimelineFanoutWorkflowDefinition, {
      args: [{ postId }],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      mode: 'start',
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  } catch (error: unknown) {
    if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
      throw error;
    }
  }
}

export async function homeTimelineFanoutWorkflow(input: HomeTimelineFanoutInput): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Home timeline fanout input is invalid',
      'HomeTimelineFanoutInputInvalid',
    );
  }

  const page = await loadHomeTimelineRecipientPageActivity({
    postId: parsed.data.postId,
    ...(parsed.data.afterProfileId === undefined
      ? {}
      : { afterProfileId: parsed.data.afterProfileId }),
  });

  await settleEffects(
    page.profileIds.map(async (profileId) => {
      try {
        await runChildWorkflow(homeTimelineInsertWorkflowDefinition, {
          args: [{ postId: parsed.data.postId, profileId }],
          cancellationType: ChildWorkflowCancellationType.ABANDON,
          mode: 'start',
          parentClosePolicy: ParentClosePolicy.ABANDON,
          workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
        });
      } catch (error: unknown) {
        if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
          throw error;
        }
      }
    }),
  );

  if (page.nextCursor !== null) {
    await continueAsNew<typeof homeTimelineFanoutWorkflow>({
      afterProfileId: page.nextCursor,
      postId: parsed.data.postId,
    });
  }
}

export const homeTimelineFanoutWorkflowDefinition: WorkflowDefinition<
  typeof homeTimelineFanoutWorkflow
> = {
  workflow: homeTimelineFanoutWorkflow,
  workflowIdFromArgs: ({ postId }) => `home-timeline-fanout:${postId}`,
};
