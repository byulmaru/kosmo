import {
  ApplicationFailure,
  ChildWorkflowCancellationType,
  ChildWorkflowFailure,
  continueAsNew,
  isCancellation,
  log,
  ParentClosePolicy,
  patched,
  proxyActivities,
  WorkflowIdReusePolicy,
  workflowInfo,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import { homeTimelineInsertWorkflowDefinition } from './home-timeline-insert';
import {
  homeTimelineInsertBatchSize,
  homeTimelineInsertBatchWorkflowDefinition,
} from './home-timeline-insert-batch';
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

const recipientPageSize = 1_000;
const maximumConcurrentBatches = 4;

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

  const batchFanoutEnabled = patched('home-timeline-batch-fanout-v1');
  const page = await loadHomeTimelineRecipientPageActivity({
    postId: parsed.data.postId,
    ...(parsed.data.afterProfileId === undefined
      ? {}
      : { afterProfileId: parsed.data.afterProfileId }),
    ...(batchFanoutEnabled ? { limit: recipientPageSize } : {}),
  });

  if (!batchFanoutEnabled) {
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
  } else {
    const batches = Array.from(
      { length: Math.ceil(page.profileIds.length / homeTimelineInsertBatchSize) },
      (_, index) =>
        page.profileIds.slice(
          index * homeTimelineInsertBatchSize,
          (index + 1) * homeTimelineInsertBatchSize,
        ),
    );
    const fanoutRunId = workflowInfo().firstExecutionRunId;
    let nextBatchIndex = 0;

    const processBatches = async (): Promise<void> => {
      while (nextBatchIndex < batches.length) {
        const profileIds = batches[nextBatchIndex]!;
        nextBatchIndex += 1;

        try {
          const child = await runChildWorkflow(homeTimelineInsertBatchWorkflowDefinition, {
            args: [{ fanoutRunId, postId: parsed.data.postId, profileIds }],
            cancellationType: ChildWorkflowCancellationType.ABANDON,
            mode: 'start',
            parentClosePolicy: ParentClosePolicy.ABANDON,
            workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
          });
          await child.result();
        } catch (error: unknown) {
          if (!(error instanceof ChildWorkflowFailure) || isCancellation(error)) {
            throw error;
          }

          log.warn('Home timeline batch insertion failed', {
            error: error.cause instanceof Error ? error.cause.message : error.message,
            fanoutRunId,
            postId: parsed.data.postId,
            startProfileId: profileIds[0],
            endProfileId: profileIds.at(-1),
          });
        }
      }
    };

    await settleEffects(
      Array.from({ length: Math.min(maximumConcurrentBatches, batches.length) }, () =>
        processBatches(),
      ),
    );
  }

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
