import { ApplicationFailure, continueAsNew, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type {
  PostContentReprocessingCounts,
  PostContentReprocessingStatus,
  ReprocessLocalPostContentsInput,
  ReprocessLocalPostContentsResult,
} from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const BATCH_SIZE = 50;

const countsSchema = z.object({
  updated: z.number().int().nonnegative(),
  wouldUpdate: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
}) satisfies z.ZodType<PostContentReprocessingCounts>;

const inputSchema = z.object({
  postIds: z.array(z.uuid()),
  dryRun: z.boolean().optional(),
  continuation: z.object({ counts: countsSchema }).optional(),
}) satisfies z.ZodType<ReprocessLocalPostContentsInput>;

const { reprocessLocalPostContentActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const emptyCounts = (): Record<PostContentReprocessingStatus, number> => ({
  updated: 0,
  wouldUpdate: 0,
  unchanged: 0,
  skipped: 0,
});

export async function reprocessLocalPostContentsWorkflow(
  input: ReprocessLocalPostContentsInput,
): Promise<ReprocessLocalPostContentsResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Post content reprocessing input is invalid',
      'VALIDATION',
    );
  }

  const { postIds, continuation } = parsed.data;
  const dryRun = parsed.data.dryRun ?? true;
  const counts = { ...(continuation?.counts ?? emptyCounts()) };
  const page = postIds.slice(0, BATCH_SIZE);

  for (const postId of page) {
    const { status } = await reprocessLocalPostContentActivity({
      postId,
      dryRun,
    });
    counts[status] += 1;
  }

  if (postIds.length > page.length) {
    await continueAsNew<typeof reprocessLocalPostContentsWorkflow>({
      dryRun,
      postIds: postIds.slice(page.length),
      continuation: { counts },
    });
  }

  return { counts };
}
