import { and, eq } from 'drizzle-orm';
import { db, first, Posts, Reactions } from '../db';
import { PostState } from '../enums';
import { NotFoundError, ValidationError } from '../error';
import { temporalClient } from '../temporal/client';
import {
  REACTION_CREATE_WORKFLOW_TYPE,
  reactionCreateWorkflowStartOptions,
} from '../temporal/reaction-create';
import {
  REACTION_DELETE_WORKFLOW_TYPE,
  reactionDeleteWorkflowStartOptions,
} from '../temporal/reaction-delete';
import { reactionTypeSchema } from '../validation';
import type { Transaction } from '../db';
import type { ReactionDeleteEffectsInput } from '../temporal/reaction-delete';

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

type AddReactionTransactionInput = {
  readonly actorProfileId: string;
  readonly postId: string;
  readonly type: string;
};

type DeleteReactionTransactionInput = {
  readonly actorProfileId: string;
  readonly expectedReactionId?: string;
  readonly postId: string;
  readonly type: string;
};

export const addReactionInTransaction = async (
  tx: Transaction,
  { actorProfileId, postId, type }: AddReactionTransactionInput,
): Promise<AddReactionResult> => {
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
    .values({ postId, profileId: actorProfileId, type })
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
          eq(Reactions.type, type),
        ),
      )
      .limit(1)
      .then(first));
  if (!reaction) {
    throw new Error('Reaction not found after insert conflict');
  }

  return { created: inserted !== undefined, reaction };
};

export const deleteReactionInTransaction = async (
  tx: Transaction,
  { actorProfileId, expectedReactionId, postId, type }: DeleteReactionTransactionInput,
): Promise<typeof Reactions.$inferSelect | null> =>
  tx
    .delete(Reactions)
    .where(
      and(
        expectedReactionId ? eq(Reactions.id, expectedReactionId) : undefined,
        eq(Reactions.profileId, actorProfileId),
        eq(Reactions.postId, postId),
        eq(Reactions.type, type),
      ),
    )
    .returning()
    .then(first)
    .then((deleted) => deleted ?? null);

const reactionDeleteSnapshot = (
  reaction: typeof Reactions.$inferSelect,
): Omit<ReactionDeleteEffectsInput, 'origin'> => ({
  createdAt: reaction.createdAt.toString(),
  id: reaction.id,
  postId: reaction.postId,
  profileId: reaction.profileId,
  type: reaction.type,
});

export const startReactionCreateEffectsWorkflow = async ({
  origin,
  reactionId,
}: {
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
  readonly reactionId: string;
}): Promise<void> => {
  try {
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start(
        REACTION_CREATE_WORKFLOW_TYPE,
        reactionCreateWorkflowStartOptions({ origin, reactionId }),
      ),
    );
  } catch (error) {
    console.error('Reaction Create effects Workflow start failed', {
      error,
      origin,
      reactionId,
    });
  }
};

export const startReactionDeleteEffectsWorkflow = async ({
  origin,
  reaction,
}: {
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
  readonly reaction: typeof Reactions.$inferSelect;
}): Promise<void> => {
  const input = { ...reactionDeleteSnapshot(reaction), origin };
  try {
    await temporalClient.withDeadline(Date.now() + 5_000, () =>
      temporalClient.workflow.start(
        REACTION_DELETE_WORKFLOW_TYPE,
        reactionDeleteWorkflowStartOptions(input),
      ),
    );
  } catch (error) {
    console.error('Reaction Delete effects Workflow start failed', {
      error,
      origin,
      reactionId: reaction.id,
    });
  }
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

  const result = await db.transaction((tx) =>
    addReactionInTransaction(tx, {
      actorProfileId,
      postId,
      type: parsedType.data,
    }),
  );

  if (result.created) {
    await startReactionCreateEffectsWorkflow({ origin, reactionId: result.reaction.id });
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
    deleteReactionInTransaction(tx, {
      actorProfileId,
      expectedReactionId,
      postId,
      type: parsedType.data,
    }),
  );

  if (reaction) {
    await startReactionDeleteEffectsWorkflow({ origin, reaction });
  }

  return { postId, reaction };
};
