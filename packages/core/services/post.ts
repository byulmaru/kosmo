import { createHash } from 'node:crypto';
import { WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from '@temporalio/client';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, first, firstOrThrow, PostContents, Posts } from '../db';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { runWorkflow, temporalClient } from '../temporal/client';
import {
  postCreateInputKey,
  postCreateWorkflow,
  postDeleteMutationWorkflow,
  unwrapPostTransition,
} from '../temporal/post';
import { quotePostCreateInput } from '../temporal/post-admission';
import { KOSMO_TASK_QUEUE } from '../temporal/task-queue';
import { createPostPersisted, repostPostPersisted } from './post-persistence';
import type {
  ActivityPubPostInput,
  ActivityPubRepostInput,
  LegacyLocalPostInput,
  LocalPostInput,
  LocalRepostInput,
  PostOrigin,
  RepostInput,
} from '../post/inputs';
import type { CreatedPost, DuplicatePost, RepostResult } from './post-persistence';

export const deletePost = async ({
  actorProfileId,
  origin,
  postId,
}: {
  readonly actorProfileId: string;
  readonly origin: PostOrigin;
  readonly postId: string;
}): Promise<{
  readonly postId: string;
  readonly replyParentId: string | null;
  readonly sourcePostId: string | null;
}> => {
  // A retained Update result belongs to the original caller, so authorize every caller before joining.
  const post = await db
    .select({ profileId: Posts.profileId })
    .from(Posts)
    .where(eq(Posts.id, postId))
    .then(first);
  if (!post) {
    throw new NotFoundError('Post not found');
  }
  if (post.profileId !== actorProfileId) {
    throw new PermissionDeniedError('Post author permission is required');
  }

  const result = unwrapPostTransition(
    await runWorkflow(postDeleteMutationWorkflow, {
      args: [{ actorProfileId, origin, postId }],
      mode: 'update-with-start',
      updateId: 'delete',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    }),
  );
  return { ...result, replyParentId: result.replyParentId ?? null };
};

export function repostPost(input: LocalRepostInput): Promise<RepostResult>;
export function repostPost(input: ActivityPubRepostInput): Promise<RepostResult>;
export async function repostPost(input: RepostInput): Promise<RepostResult> {
  const result = await repostPostPersisted(input);

  if (result.created) {
    const workflowInput = { origin: input.origin, postId: result.repost.id };
    try {
      await temporalClient.withDeadline(Date.now() + 5_000, () =>
        temporalClient.workflow.start('postRepostWorkflow', {
          args: [workflowInput],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: `post-repost:${workflowInput.postId}`,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        }),
      );
    } catch (error) {
      console.error('Post Repost Workflow start failed', {
        error,
        origin: input.origin,
        postId: result.repost.id,
      });
    }
  }

  return result;
}
export function createPost(input: LocalPostInput | LegacyLocalPostInput): Promise<CreatedPost>;
export function createPost(input: ActivityPubPostInput): Promise<CreatedPost | DuplicatePost>;
export async function createPost(
  input: LocalPostInput | LegacyLocalPostInput | ActivityPubPostInput,
): Promise<CreatedPost | DuplicatePost> {
  if (
    input.origin === 'LOCAL' &&
    input.repostSourceId === undefined &&
    input.admissionId !== undefined
  ) {
    throw new ValidationError('Quote admission requires its original Source', {
      field: 'admissionId',
    });
  }
  if (input.origin === 'LOCAL' && input.repostSourceId !== undefined) {
    const admission = /^(\d{13}):(.+)$/.exec(input.admissionId ?? '');
    if (!admission || !z.uuid().safeParse(admission[2]).success) {
      throw new ValidationError('Quote creation requires its original admission identity', {
        field: 'admissionId',
      });
    }
    const issuedAt = Number(admission[1]);
    // Only recent first submissions may start. Older attempts can recover retained results,
    // but missing history (including a later retention increase) must never create a new Post.
    const firstStartWindow = 5 * 60_000;
    if (issuedAt > Date.now() + 30_000) {
      throw new ValidationError('Quote admission timestamp is in the future', {
        field: 'admissionId',
      });
    }
    const command = quotePostCreateInput(input);

    const updateId = createHash('sha256').update(postCreateInputKey(command)).digest('hex');
    const recover = () =>
      runWorkflow(postCreateWorkflow, {
        args: [command],
        updateId,
        mode: 'update-result',
      });
    let postId: string;
    try {
      let outcome: Awaited<ReturnType<typeof recover>>;
      try {
        // Closed Runs cannot receive a new Update-with-Start, but their Update results remain readable.
        outcome = await recover();
      } catch (error) {
        if (!(error instanceof WorkflowNotFoundError)) {
          throw error;
        }
        if (Date.now() - issuedAt > firstStartWindow) {
          throw new ValidationError(
            'Quote admission expired; its result cannot be safely recreated',
            {
              field: 'admissionId',
            },
          );
        }
        try {
          outcome = await runWorkflow(postCreateWorkflow, {
            args: [command],
            updateArgs: [command],
            // A different payload must reach validation rather than replay a cached Update result.
            updateId,
            mode: 'update-with-start',
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowIdReusePolicy: 'REJECT_DUPLICATE',
          });
        } catch (startError) {
          if (!(startError instanceof WorkflowExecutionAlreadyStartedError)) {
            throw startError;
          }
          // Another caller may have started and completed between the lookup and start.
          outcome = await recover();
        }
      }
      ({ postId } = unwrapPostTransition(outcome));
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        throw new ValidationError(
          'Quote admission payload does not match its original submission',
          {
            field: 'admissionId',
          },
        );
      }
      throw error;
    }
    const post = await db.select().from(Posts).where(eq(Posts.id, postId)).then(firstOrThrow);
    const content = await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.id, post.currentContentId!))
      .then(firstOrThrow);
    return { created: true, post, content };
  }
  const result = await createPostPersisted(input);
  if (!result.created) {
    return result;
  }
  try {
    const workflowInput = { postId: result.post.id, origin: input.origin };
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start('postCreateEffectsWorkflow', {
        args: [workflowInput],
        taskQueue: KOSMO_TASK_QUEUE,
        workflowId: `post-create-effects:${workflowInput.postId}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
      }),
    );
  } catch (error) {
    console.error('Post Create effects Workflow start failed', {
      error,
      origin: input.origin,
      postId: result.post.id,
    });
  }

  return { content: result.content, created: true, post: result.post };
}
