import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

const activityPubQuoteResolutionInputSchema = z.strictObject({
  postId: z.string().min(1),
  targetUri: z.url(),
  format: z.enum(['FEP_044F', 'LEGACY']),
  approvalUri: z.url().nullable(),
  expectedStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']).nullable(),
  expectedApprovalUri: z.url().nullable(),
  expectedRepostSourceId: z.string().nullable(),
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
  let latest = parsed.data;
  let pending: ActivityPubQuoteResolutionInput | null = latest;
  setHandler(defineQuery<ActivityPubQuoteResolutionInput>('inboundQuoteInput'), () => latest);
  setHandler(defineSignal<[ActivityPubQuoteResolutionInput]>('resolveQuote'), (input) => {
    const update = activityPubQuoteResolutionInputSchema.safeParse(input);
    if (
      !update.success ||
      update.data.postId !== latest.postId ||
      update.data.targetUri !== latest.targetUri ||
      update.data.format !== latest.format
    ) {
      return;
    }
    latest = update.data;
    pending = latest;
  });
  let attempts = 0;
  while (pending !== null) {
    const current: ActivityPubQuoteResolutionInput = pending;
    pending = null;
    const result: Awaited<ReturnType<typeof resolveActivityPubQuoteActivity>> =
      await resolveActivityPubQuoteActivity(current);
    if (result.retryable && result.retryInput) {
      if (++attempts >= 10) {
        throw new Error('Quote resolution retry limit reached');
      }
      await condition(() => pending !== null, Math.min(1000 * 2 ** (attempts - 1), 60000));
      if (pending === null) {
        pending = result.retryInput;
      }
    } else {
      attempts = 0;
    }
  }
}
