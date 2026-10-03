import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
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
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';
import type { PostCreateInput, PostTransitionOutcome } from '@kosmo/core/temporal/post';
import type * as activities from '../activities';

const inputSchema = z.strictObject({
  admissionId: z.uuid(),
  accountId: z.uuid().optional(),
  document: z.custom<PostContentDocumentV1>(isPostContentDocumentV1),
  media: z.array(z.strictObject({ altText: z.string().nullable(), mediaId: z.uuid() })).optional(),
  origin: z.literal('LOCAL'),
  profileId: z.uuid(),
  replyParentId: z.uuid().optional(),
  repostSourceId: z.uuid().optional(),
  quotePolicy: z.enum(['EVERYONE', 'FOLLOWERS', 'AUTHOR']).nullish(),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'FOLLOWERS', 'DIRECT']),
}) satisfies z.ZodType<PostCreateInput>;
const {
  reservePostIdActivity,
  createPostTransitionActivity,
  createReplyNotificationActivity,
  createQuoteNotificationActivity,
  sendLocalPostCreateActivity,
  sendLocalPostQuoteRequestActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postCreateWorkflow(input: PostCreateInput): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable('Invalid Post create input');
  }
  let received = false;
  let execution: Awaited<ReturnType<typeof activities.createPostTransitionActivity>> | undefined;
  let failure: unknown;
  setHandler(
    defineUpdate<PostTransitionOutcome<{ postId: string }>>('createPost'),
    async () => {
      received = true;
      try {
        const postId = await reservePostIdActivity();
        execution = await createPostTransitionActivity(parsed.data, postId);
        return execution.ok ? { ok: true as const, result: execution.result } : execution;
      } catch (error) {
        failure = error;
        throw error;
      }
    },
    {
      validator: () => {
        if (received) {
          throw ApplicationFailure.nonRetryable('Post create already admitted');
        }
      },
    },
  );
  if (!(await condition(() => received, '1 minute'))) {
    return;
  }
  await condition(allHandlersFinished);
  if (failure) {
    throw failure;
  }
  if (!execution?.ok) {
    return;
  }
  const postId = execution.result.postId;
  await settleEffects([
    createReplyNotificationActivity(postId),
    createQuoteNotificationActivity(postId),
    sendLocalPostCreateActivity(postId),
    ...(execution.quoteRequest ? [sendLocalPostQuoteRequestActivity(execution.quoteRequest)] : []),
  ]);
}
