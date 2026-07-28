import { and, eq } from 'drizzle-orm';
import { first, getDatabaseConnection, Posts, Reactions } from '../db';
import { NotificationKind, PostState } from '../enums';
import { NotFoundError, ValidationError } from '../error';
import { reactionTypeSchema } from '../validation';
import { deleteNotificationBySource } from './notification';
import type { Transaction } from '../db';

type AddReactionInput = {
  readonly actorProfileId: string;
  readonly postId: string;
  readonly type: string;
};

export const addReaction = async (
  { actorProfileId, postId, type }: AddReactionInput,
  tx?: Transaction,
): Promise<{ readonly created: boolean; readonly reaction: typeof Reactions.$inferSelect }> => {
  const parsedType = reactionTypeSchema.safeParse(type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  return getDatabaseConnection(tx).transaction(async (tx) => {
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
};

type DeleteReactionInput = {
  readonly actorProfileId: string;
  readonly postId: string;
  readonly type: string;
};

export const removeReaction = async (
  input: DeleteReactionInput,
  tx?: Transaction,
): Promise<{
  readonly postId: string;
  readonly reaction: typeof Reactions.$inferSelect | null;
}> => {
  const parsedType = reactionTypeSchema.safeParse(input.type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  return getDatabaseConnection(tx).transaction(async (tx) => {
    const deleted = await tx
      .delete(Reactions)
      .where(
        and(
          eq(Reactions.profileId, input.actorProfileId),
          eq(Reactions.postId, input.postId),
          eq(Reactions.type, parsedType.data),
        ),
      )
      .returning()
      .then(first);

    return { postId: input.postId, reaction: deleted ?? null };
  });
};

export const deleteReaction = async (
  input: DeleteReactionInput,
): Promise<{ readonly postId: string; readonly reactionId: string | null }> => {
  const removed = await removeReaction(input);
  const result = { postId: removed.postId, reactionId: removed.reaction?.id ?? null };

  if (result.reactionId) {
    try {
      await deleteNotificationBySource(NotificationKind.REACTION, result.reactionId);
    } catch (error) {
      console.error('Failed to clean up Reaction Notification', {
        error,
        reactionId: result.reactionId,
      });
    }
  }

  return result;
};
