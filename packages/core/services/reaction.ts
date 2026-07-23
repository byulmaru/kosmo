import { and, eq } from 'drizzle-orm';
import { first, getDatabaseConnection, Instances, Posts, Profiles, Reactions } from '../db';
import { InstanceKind, InstanceState, PostState, ProfileState } from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { reactionTypeSchema } from '../validation';
import type { Transaction } from '../db';

const requireReactionActor = async (tx: Transaction, actorProfileId: string): Promise<void> => {
  const actor = await tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.id, actorProfileId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);
  if (!actor) {
    throw new PermissionDeniedError();
  }
};

type AddReactionInput = {
  readonly actorProfileId: string;
  readonly postId: string;
  readonly type: string;
};

export const addReactionWithStatus = async (
  { actorProfileId, postId, type }: AddReactionInput,
  tx?: Transaction,
): Promise<{ readonly created: boolean; readonly reaction: typeof Reactions.$inferSelect }> => {
  const parsedType = reactionTypeSchema.safeParse(type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  return getDatabaseConnection(tx).transaction(async (tx) => {
    await requireReactionActor(tx, actorProfileId);

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

export const addReaction = async (input: AddReactionInput, tx?: Transaction) =>
  (await addReactionWithStatus(input, tx)).reaction;

export const deleteReaction = async (
  {
    actorProfileId,
    reactionId,
  }: {
    readonly actorProfileId: string;
    readonly reactionId: string;
  },
  tx?: Transaction,
): Promise<{ readonly reactionId: string }> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    await requireReactionActor(tx, actorProfileId);

    const reaction = await tx
      .select({ profileId: Reactions.profileId })
      .from(Reactions)
      .where(eq(Reactions.id, reactionId))
      .limit(1)
      .then(first);
    if (!reaction) {
      return { reactionId };
    }
    if (reaction.profileId !== actorProfileId) {
      throw new PermissionDeniedError('Reaction owner permission is required');
    }

    await tx
      .delete(Reactions)
      .where(and(eq(Reactions.id, reactionId), eq(Reactions.profileId, actorProfileId)));

    return { reactionId };
  });
