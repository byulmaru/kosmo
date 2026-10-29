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

const countsSchema = z.strictObject({
  updated: z.number().int().nonnegative(),
  wouldUpdate: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
}) satisfies z.ZodType<PostContentReprocessingCounts>;

const inputSchema = z.strictObject({
  dryRun: z.boolean().optional(),
  continuation: z
    .strictObject({
      maxPostId: z.uuid(),
      afterPostId: z.uuid().optional(),
      counts: countsSchema,
    })
    .optional(),
}) satisfies z.ZodType<ReprocessLocalPostContentsInput>;

const { loadLocalPostsForContentReprocessingActivity, reprocessLocalPostContentActivity } =
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

  const { continuation } = parsed.data;
  const dryRun = parsed.data.dryRun ?? true;
  const counts = { ...(continuation?.counts ?? emptyCounts()) };
  const page = await loadLocalPostsForContentReprocessingActivity({
    ...(continuation?.afterPostId === undefined ? {} : { afterPostId: continuation.afterPostId }),
    ...(continuation === undefined ? {} : { maxPostId: continuation.maxPostId }),
    limit: BATCH_SIZE,
  });

  for (const candidate of page.posts) {
    const { status } = await reprocessLocalPostContentActivity({
      ...candidate,
      dryRun,
    });
    counts[status] += 1;
  }

  if (page.posts.length === BATCH_SIZE) {
    const lastPost = page.posts.at(-1)!;
    if (page.maxPostId === null) {
      throw ApplicationFailure.nonRetryable(
        'Post content reprocessing candidate page is missing its upper bound',
        'INVALID_ACTIVITY_RESULT',
      );
    }

    await continueAsNew<typeof reprocessLocalPostContentsWorkflow>({
      dryRun,
      continuation: {
        maxPostId: page.maxPostId,
        afterPostId: lastPost.postId,
        counts,
      },
    });
  }

  return { maxPostId: page.maxPostId, counts };
}
