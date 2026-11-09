import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import type { LinkPreviewCollectionInput } from '@kosmo/core/temporal/link-preview';
import type * as activities from '../activities';

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
