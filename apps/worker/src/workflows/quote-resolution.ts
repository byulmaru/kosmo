import { proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

const activityPubQuoteResolutionInputSchema = z.strictObject({
  postId: z.string().min(1),
  revision: z.number().int().positive(),
});

export type ActivityPubQuoteResolutionInput = z.infer<typeof activityPubQuoteResolutionInputSchema>;

const { resolveActivityPubQuoteActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function activitypubQuoteResolutionWorkflow(
  input: ActivityPubQuoteResolutionInput,
): Promise<void> {
  const parsed = activityPubQuoteResolutionInputSchema.safeParse(input);
  if (!parsed.success) {
    return;
  }
  await resolveActivityPubQuoteActivity(parsed.data);
}
