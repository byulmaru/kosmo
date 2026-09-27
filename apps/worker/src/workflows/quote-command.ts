import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type { PostQuoteCommand, PostQuoteCommandResult } from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const identity = z.string().min(1);
const commandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('request'),
    approvalUri: identity,
    quoteAuthorActorUri: identity,
    quoteAuthorProfileId: identity,
    quotePostId: identity,
    quoteUri: identity,
    requestUri: identity,
    sourceAuthorActorUri: identity,
    sourcePostId: identity,
    sourceUri: identity,
  }),
  z.strictObject({
    kind: z.literal('accept'),
    approvalUri: identity,
    quoteUri: identity,
    requestUri: identity,
    sourceAuthorActorUri: identity,
    sourceUri: identity,
  }),
  z.strictObject({
    kind: z.literal('reject'),
    requestUri: identity,
    sourceAuthorActorUri: identity,
  }),
  z.strictObject({
    kind: z.literal('revoke'),
    approvalUri: identity,
    consentId: identity.optional(),
    quoteUri: identity,
    sourceAuthorActorUri: identity,
    sourceUri: identity,
  }),
]) satisfies z.ZodType<PostQuoteCommand>;

const {
  executePostQuoteCommandActivity,
  sendLocalPostConsentUpdateActivity,
  sendLocalPostQuoteDecisionActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postQuoteCommandWorkflow(input: PostQuoteCommand): Promise<void> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable('Invalid Quote command');
  }
  const command = parsed.data;
  let started = false;
  let result: PostQuoteCommandResult | undefined;
  let failure: unknown;
  setHandler(defineUpdate<PostQuoteCommandResult>('postQuoteCommand'), async () => {
    started = true;
    try {
      result = await executePostQuoteCommandActivity(command);
      return result;
    } catch (error) {
      failure = error;
      throw error;
    }
  });
  if (!(await condition(() => started, '1 minute'))) {
    return;
  }
  await condition(allHandlersFinished);
  if (failure) {
    throw failure;
  }
  if (!result) {
    return;
  }
  await settleEffects([
    ...(command.kind === 'request'
      ? [sendLocalPostQuoteDecisionActivity(result)]
      : result.postId
        ? [sendLocalPostConsentUpdateActivity({ ...result, postId: result.postId })]
        : []),
  ]);
}
