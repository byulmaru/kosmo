import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';
import type * as activities from '../activities';

export const LINK_PREVIEW_COLLECTION_WORKFLOW_TYPE = 'linkPreviewCollectionWorkflow';

export type LinkPreviewCollectionInput = {
  readonly postId: string;
};

const inputSchema = z.object({ postId: z.uuid() }) satisfies z.ZodType<LinkPreviewCollectionInput>;

const { collectPostLinkPreviewActivity } = proxyActivities<typeof activities>({
  retry: { maximumAttempts: 1 },
  startToCloseTimeout: '8 seconds',
});

export async function linkPreviewCollectionWorkflow(
  input: LinkPreviewCollectionInput,
): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Link preview input is invalid',
      'VALIDATION',
    );
  }

  return collectPostLinkPreviewActivity(parsed.data);
}

export const linkPreviewCollectionWorkflowDefinition: WorkflowDefinition<
  typeof linkPreviewCollectionWorkflow
> = {
  workflow: LINK_PREVIEW_COLLECTION_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ postId }) => `post-link-preview:${postId}`,
};
