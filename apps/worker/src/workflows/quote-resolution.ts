import {
  ApplicationFailure,
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
  const original = parsed.data;
  type Attempt = { input: ActivityPubQuoteResolutionInput; attempts: number };
  const pending: Attempt[] = [{ input: original, attempts: 0 }];
  let active: Attempt | undefined;
  const sameSnapshot = (
    left: ActivityPubQuoteResolutionInput,
    right: ActivityPubQuoteResolutionInput,
  ) =>
    left.approvalUri === right.approvalUri &&
    left.expectedStatus === right.expectedStatus &&
    left.expectedApprovalUri === right.expectedApprovalUri &&
    left.expectedRepostSourceId === right.expectedRepostSourceId;
  // Quote identity is immutable; candidates are validated against Posts by the Activity.
  setHandler(defineQuery<ActivityPubQuoteResolutionInput>('inboundQuoteInput'), () => original);
  setHandler(defineSignal<[ActivityPubQuoteResolutionInput]>('resolveQuote'), (input) => {
    const update = activityPubQuoteResolutionInputSchema.safeParse(input);
    if (
      !update.success ||
      update.data.postId !== original.postId ||
      update.data.targetUri !== original.targetUri ||
      update.data.format !== original.format
    ) {
      return;
    }
    if (active && sameSnapshot(active.input, update.data)) {
      return;
    }
    if (!pending.some((attempt) => sameSnapshot(attempt.input, update.data))) {
      pending.push({ input: update.data, attempts: 0 });
    }
  });
  while (pending.length > 0) {
    active = pending.shift()!;
    const result = await resolveActivityPubQuoteActivity(active.input);
    if (result.retryable && result.retryInput) {
      if (active.attempts + 1 >= 10) {
        if (pending.length > 0) {
          active = undefined;
          continue;
        }
        throw ApplicationFailure.nonRetryable('Quote resolution retry limit reached');
      }
      await condition(() => pending.length > 0, Math.min(1000 * 2 ** active.attempts, 60000));
      // A delayed stale signal cannot discard the successful Activity's retry input.
      if (!pending.some((attempt) => sameSnapshot(attempt.input, result.retryInput!))) {
        pending.push({ input: result.retryInput, attempts: active.attempts + 1 });
      }
    }
    active = undefined;
  }
}
