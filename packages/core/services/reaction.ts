import { and, eq } from 'drizzle-orm';
import { first, getDatabaseConnection, Posts, Reactions } from '../db';
import { NotificationKind, PostState } from '../enums';
import { NotFoundError, ValidationError } from '../error';
import { reactionTypeSchema } from '../validation';
import { createReactionNotification, deleteNotificationBySource } from './notification';
import type { Transaction } from '../db';

type AddReactionInput = {
  readonly actorProfileId: string;
  readonly postId: string;
  readonly type: string;
};

type AddReactionExecution =
  | { readonly mode: 'APPLICATION' }
  | { readonly mode: 'MATERIALIZATION'; readonly tx: Transaction };

export const addReaction = async (
  { actorProfileId, postId, type }: AddReactionInput,
  execution: AddReactionExecution,
): Promise<{ readonly created: boolean; readonly reaction: typeof Reactions.$inferSelect }> => {
  const parsedType = reactionTypeSchema.safeParse(type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  const result = await getDatabaseConnection(
    execution.mode === 'MATERIALIZATION' ? execution.tx : undefined,
  ).transaction(async (tx) => {
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

  if (execution.mode === 'MATERIALIZATION' || !result.created) {
    return result;
  }

  await createReactionNotification(result.reaction.id).catch(() => undefined);

  try {
    const { sendReaction } = await import('@kosmo/fedify');
    await sendReaction(result.reaction);
  } catch (error) {
    console.error('Post-commit ActivityPub Reaction delivery failed', {
      error,
      reactionId: result.reaction.id,
    });
  }

  return result;
};

type DeleteReactionInput = {
  readonly actorProfileId: string;
  readonly postId: string;
  readonly type: string;
};

export const deleteReaction = async (
  input: DeleteReactionInput,
): Promise<{ readonly postId: string; readonly reactionId: string | null }> => {
  const parsedType = reactionTypeSchema.safeParse(input.type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  const reaction = await getDatabaseConnection()
    .transaction((tx) =>
      tx
        .delete(Reactions)
        .where(
          and(
            eq(Reactions.profileId, input.actorProfileId),
            eq(Reactions.postId, input.postId),
            eq(Reactions.type, parsedType.data),
          ),
        )
        .returning()
        .then(first),
    )
    .then((deleted) => deleted ?? null);
  if (reaction) {
    try {
      await deleteNotificationBySource(NotificationKind.REACTION, reaction.id);
    } catch (error) {
      console.error('Failed to clean up Reaction Notification', {
        error,
        reactionId: reaction.id,
      });
    }

    try {
      const { sendReactionUndo } = await import('@kosmo/fedify');
      await sendReactionUndo(reaction);
    } catch (error) {
      console.error('Post-commit ActivityPub Reaction Undo delivery failed', {
        error,
        reactionId: reaction.id,
      });
    }
  }

  return { postId: input.postId, reactionId: reaction?.id ?? null };
};
