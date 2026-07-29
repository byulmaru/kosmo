import { and, eq } from 'drizzle-orm';
import { first, getDatabaseConnection, Posts, Reactions } from '../db';
import { NotificationKind, PostState } from '../enums';
import { NotFoundError, ValidationError } from '../error';
import { reactionTypeSchema } from '../validation';
import { createReactionNotification, deleteNotificationBySource } from './notification';
import type { Transaction } from '../db';

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

export const addReaction = async (
  { actorProfileId, origin, postId, type }: AddReactionInput,
  tx?: Transaction,
): Promise<AddReactionResult> => {
  const parsedType = reactionTypeSchema.safeParse(type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  const result = await getDatabaseConnection(tx).transaction(async (tx) => {
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

  // A caller-owned transaction has no after-commit hook. Its caller owns any
  // post-commit side effect so delivery cannot run before the outer commit.
  if (!tx && result.created) {
    await createReactionNotification(result.reaction.id).catch(() => undefined);

    if (origin === 'LOCAL') {
      try {
        const { sendReaction } = await import('@kosmo/fedify');
        await sendReaction(result.reaction);
      } catch (error) {
        console.error('Post-commit ActivityPub Reaction delivery failed', {
          error,
          reactionId: result.reaction.id,
        });
      }
    }
  }

  return result;
};

export const deleteReaction = async (
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

  const reaction = await getDatabaseConnection(tx)
    .transaction((tx) =>
      tx
        .delete(Reactions)
        .where(
          and(
            input.expectedReactionId ? eq(Reactions.id, input.expectedReactionId) : undefined,
            eq(Reactions.profileId, input.actorProfileId),
            eq(Reactions.postId, input.postId),
            eq(Reactions.type, parsedType.data),
          ),
        )
        .returning()
        .then(first),
    )
    .then((deleted) => deleted ?? null);
  if (!tx && reaction) {
    try {
      await deleteNotificationBySource(NotificationKind.REACTION, reaction.id);
    } catch (error) {
      console.error('Failed to clean up Reaction Notification', {
        error,
        reactionId: reaction.id,
      });
    }

    if (input.origin === 'LOCAL') {
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
  }

  return { postId: input.postId, reaction };
};
