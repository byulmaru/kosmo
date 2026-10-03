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
import type {
  PostDeleteInput,
  PostDeleteResult,
  PostTransitionOutcome,
} from '@kosmo/core/temporal/post';
import type * as activities from '../activities';

const inputSchema = z.strictObject({
  actorProfileId: z.uuid(),
  postId: z.uuid(),
  origin: z.enum(['LOCAL', 'ACTIVITYPUB']),
}) satisfies z.ZodType<PostDeleteInput>;
const {
  verifyPostDeletionActivity,
  deletePostTransitionActivity,
  sendLocalPostDeleteActivity,
  sendLocalPostQuoteRevocationsActivity,
  deleteRepostNotificationActivity,
  sendRepostUndoActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function postDeleteMutationWorkflow(input: PostDeleteInput): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable('Invalid Post delete input');
  }
  let received = false;
  let active = false;
  let execution: PostTransitionOutcome<PostDeleteResult> | undefined;
  let failure: unknown;
  setHandler(
    defineUpdate<PostTransitionOutcome<PostDeleteResult>>('deletePost'),
    async () => {
      received = true;
      try {
        const verified = await verifyPostDeletionActivity(parsed.data);
        if (!verified.ok) {
          execution = verified;
          return execution;
        }
        active = verified.result.active;
        execution = active
          ? await deletePostTransitionActivity(parsed.data)
          : {
              ok: true,
              result: { postId: input.postId, sourcePostId: verified.result.sourcePostId },
            };
        return execution;
      } catch (error) {
        failure = error;
        throw error;
      }
    },
    {
      validator: () => {
        if (received) {
          throw ApplicationFailure.nonRetryable('Post delete already admitted');
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
  if (!execution?.ok || !active) {
    return;
  }
  if (execution.result.sourcePostId) {
    await settleEffects([
      deleteRepostNotificationActivity(input.postId),
      ...(input.origin === 'LOCAL' ? [sendRepostUndoActivity(input.postId)] : []),
    ]);
  } else {
    await settleEffects([
      sendLocalPostQuoteRevocationsActivity(input.postId),
      ...(input.origin === 'LOCAL' ? [sendLocalPostDeleteActivity(input.postId)] : []),
    ]);
  }
}
