import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type {
  ReprocessLocalPostContentInput,
  ReprocessLocalPostContentResult,
} from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const inputSchema = z.strictObject({
  postId: z.uuid(),
  postContentId: z.uuid(),
  dryRun: z.boolean().optional(),
}) satisfies z.ZodType<ReprocessLocalPostContentInput>;

const { reprocessLocalPostContentActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function reprocessLocalPostContentWorkflow(
  input: ReprocessLocalPostContentInput,
): Promise<ReprocessLocalPostContentResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Post content reprocessing input is invalid',
      'VALIDATION',
    );
  }

  return reprocessLocalPostContentActivity({
    ...parsed.data,
    dryRun: parsed.data.dryRun ?? true,
  });
}
