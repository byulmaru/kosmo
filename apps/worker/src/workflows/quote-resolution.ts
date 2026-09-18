import { proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { TrustedInboundQuoteSource } from '@kosmo/fedify';
import type * as activities from '../activities';

const trustedInboundQuoteSourceSchema = z.strictObject({
  authorUri: z.string().url(),
  sourceUri: z.string().url(),
}) satisfies z.ZodType<TrustedInboundQuoteSource>;

const activityPubQuoteResolutionInputSchema = z.strictObject({
  postId: z.string().min(1),
  revision: z.number().int().positive(),
  trustedSource: trustedInboundQuoteSourceSchema.optional(),
});

export type ActivityPubQuoteResolutionInput = {
  readonly postId: string;
  readonly revision: number;
  readonly trustedSource?: TrustedInboundQuoteSource;
};

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
