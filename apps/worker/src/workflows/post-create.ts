import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import { postCreateInputKey } from '@kosmo/core/temporal/post';
import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineUpdate,
  patched,
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
  admissionId: z.string(),
  accountId: z.uuid().optional(),
  authoredBodyText: z.string().optional(),
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
  createNotificationActivity,
  createReplyNotificationActivity,
  createQuoteNotificationActivity,
  sendLocalPostCreateActivity,
  sendLocalPostQuoteRequestActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postCreateWorkflow(input: PostCreateInput): Promise<void> {
  const currentAdmission = patched('post-create-quote-admission-v1');
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable('Invalid Post create input');
  }
  const admission = /^(\d{13}):(.+)$/.exec(parsed.data.admissionId);
  if (currentAdmission && (!admission || !z.uuid().safeParse(admission[2]).success)) {
    throw ApplicationFailure.nonRetryable('Invalid Post create input');
  }
  let received = false;
  let execution: Awaited<ReturnType<typeof activities.createPostTransitionActivity>> | undefined;
  let failure: unknown;
  setHandler(
    defineUpdate<PostTransitionOutcome<{ postId: string }>, [PostCreateInput?]>('createPost'),
    async (submitted = input) => {
      const candidate = inputSchema.safeParse(submitted);
      if (
        !candidate.success ||
        postCreateInputKey(candidate.data) !== postCreateInputKey(parsed.data)
      ) {
        return {
          ok: false as const,
          error: {
            code: 'VALIDATION' as const,
            message: 'Quote admission payload does not match its original submission',
            field: 'admissionId',
          },
        };
      }
      if (received) {
        await condition(() => execution !== undefined || failure !== undefined);
        if (failure) {
          throw failure;
        }
        return execution!;
      }
      received = true;
      try {
        const postId = currentAdmission
          ? await reservePostIdActivity(parsed.data)
          : await reservePostIdActivity();
        execution = await createPostTransitionActivity(parsed.data, postId);
        return execution.ok ? { ok: true as const, result: execution.result } : execution;
      } catch (error) {
        failure = error;
        throw error;
      }
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
    ...(currentAdmission
      ? [
          createNotificationActivity({ kind: 'REPLY', sourceId: postId }),
          createNotificationActivity({ kind: 'QUOTE', sourceId: postId }),
          createNotificationActivity({ kind: 'MENTION', sourceId: postId }),
        ]
      : [createReplyNotificationActivity(postId), createQuoteNotificationActivity(postId)]),
    sendLocalPostCreateActivity(postId),
    ...(execution.quoteRequest ? [sendLocalPostQuoteRequestActivity(execution.quoteRequest)] : []),
  ]);
}
