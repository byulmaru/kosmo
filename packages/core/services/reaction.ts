import { and, eq } from 'drizzle-orm';
import { AccountProfiles, Accounts, db, first, Instances, Posts, Profiles, Reactions } from '../db';
import { AccountState, InstanceKind, InstanceState, PostState, ProfileState } from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { reactionTypeSchema } from '../validation';
import type { ReactionType } from '../validation';

export type ReactionRow = typeof Reactions.$inferSelect;

export const addReaction = async ({
  accountId,
  postId,
  profileId,
  type,
}: {
  readonly accountId: string;
  readonly postId: string;
  readonly profileId: string;
  readonly type: string;
}): Promise<{ readonly created: boolean; readonly reaction: ReactionRow }> => {
  const parsedType = reactionTypeSchema.safeParse(type);
  if (!parsedType.success) {
    throw new ValidationError(parsedType.error.issues[0]?.message, { field: 'type' });
  }

  return db.transaction(async (tx) => {
    const actor = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(
        AccountProfiles,
        and(eq(AccountProfiles.profileId, Profiles.id), eq(AccountProfiles.accountId, accountId)),
      )
      .innerJoin(Accounts, eq(Accounts.id, AccountProfiles.accountId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(Profiles.id, profileId),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Accounts.state, AccountState.ACTIVE),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.state, InstanceState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);
    if (!actor) {
      throw new PermissionDeniedError();
    }

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
      .values({ postId, profileId, type: parsedType.data satisfies ReactionType })
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
            eq(Reactions.profileId, profileId),
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
