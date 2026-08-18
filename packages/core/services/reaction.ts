import { and, eq } from 'drizzle-orm';
import { db, first, Posts, Reactions } from '../db';
import { PostState } from '../enums';
import { NotFoundError, ValidationError } from '../error';
import { temporalClient } from '../temporal/client';
import { KOSMO_TASK_QUEUE } from '../temporal/task-queue';
import { reactionTypeSchema } from '../validation';

type AddReactionInput = {
  readonly actorProfileId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
  readonly postId: string;
  readonly type: string;
};

type DeleteReactionInput = {
  readonly actorProfileId: string;
  readonly expectedReactionId?: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
  readonly postId: string;
  readonly type: string;
};

type AddReactionResult = {
  readonly created: boolean;
  readonly reaction: typeof Reactions.$inferSelect;
};

export const addReaction = async ({
  actorProfileId,
  origin,
  postId,
  type,
}: AddReactionInput): Promise<AddReactionResult> => {
  const parsedType = reactionTypeSchema.safeParse(type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  const result = await db.transaction(async (tx) => {
    const post = await tx
      .select({ id: Posts.id })
      .from(Posts)
      .where(and(eq(Posts.id, postId), eq(Posts.state, PostState.ACTIVE)))
      .limit(1)
      .then(first);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    const inserted = await tx
      .insert(Reactions)
      .values({ postId, profileId: actorProfileId, type: parsedType.data })
      .onConflictDoNothing({
        target: [Reactions.postId, Reactions.type, Reactions.profileId],
      })
      .returning()
      .then(first);
    const reaction =
      inserted ??
      (await tx
        .select()
        .from(Reactions)
        .where(
          and(
            eq(Reactions.postId, postId),
            eq(Reactions.profileId, actorProfileId),
            eq(Reactions.type, parsedType.data),
          ),
        )
        .limit(1)
        .then(first));
    if (!reaction) {
      throw new Error('Reaction not found after insert conflict');
    }

    return { created: inserted !== undefined, reaction };
  });

  if (result.created) {
    try {
      await temporalClient.withDeadline(Date.now() + 5_000, () =>
        temporalClient.workflow.start('reactionCreateEffectsWorkflow', {
          args: [{ origin, reactionId: result.reaction.id }],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: `reaction-create-effects:${result.reaction.id}`,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        }),
      );
    } catch (error) {
      console.error('Reaction Create effects Workflow start failed', {
        error,
        origin,
        reactionId: result.reaction.id,
      });
    }
  }

  return result;
};

export const deleteReaction = async ({
  actorProfileId,
  expectedReactionId,
  origin,
  postId,
  type,
}: DeleteReactionInput): Promise<{
  readonly postId: string;
  readonly reaction: typeof Reactions.$inferSelect | null;
}> => {
  const parsedType = reactionTypeSchema.safeParse(type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  const reaction = await db.transaction((tx) =>
    tx
      .delete(Reactions)
      .where(
        and(
          expectedReactionId ? eq(Reactions.id, expectedReactionId) : undefined,
          eq(Reactions.profileId, actorProfileId),
          eq(Reactions.postId, postId),
          eq(Reactions.type, parsedType.data),
        ),
      )
      .returning()
      .then(first)
      .then((deleted) => deleted ?? null),
  );

  if (reaction) {
    const input = {
      createdAt: reaction.createdAt.toString(),
      id: reaction.id,
      origin,
      postId: reaction.postId,
      profileId: reaction.profileId,
      type: reaction.type,
    };
    try {
      await temporalClient.withDeadline(Date.now() + 5_000, () =>
        temporalClient.workflow.start('reactionDeleteEffectsWorkflow', {
          args: [input],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: `reaction-delete-effects:${input.id}`,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        }),
      );
    } catch (error) {
      console.error('Reaction Delete effects Workflow start failed', {
        error,
        origin,
        reactionId: reaction.id,
      });
    }
  }

  return { postId, reaction };
};
