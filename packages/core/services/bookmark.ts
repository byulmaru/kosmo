import { and, eq, exists } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  Bookmarks,
  first,
  getDatabaseConnection,
  Instances,
  Profiles,
} from '../db';
import { AccountState, InstanceKind, InstanceState, ProfileState } from '../enums';
import type { Transaction } from '../db';

export const createBookmark = async (
  {
    postId,
    profileId,
  }: {
    readonly postId: string;
    readonly profileId: string;
  },
  tx?: Transaction,
): Promise<typeof Bookmarks.$inferSelect> => {
  const connection = getDatabaseConnection(tx);
  const inserted = await connection
    .insert(Bookmarks)
    .values({ postId, profileId })
    .onConflictDoNothing({ target: [Bookmarks.profileId, Bookmarks.postId] })
    .returning()
    .then(first);

  const bookmark =
    inserted ??
    (await connection
      .select()
      .from(Bookmarks)
      .where(and(eq(Bookmarks.profileId, profileId), eq(Bookmarks.postId, postId)))
      .limit(1)
      .then(first));
  if (!bookmark) {
    throw new Error('Bookmark not found after insert conflict');
  }

  return bookmark;
};

export const deleteBookmark = async (
  {
    accountId,
    bookmarkId,
    profileId,
  }: {
    readonly accountId: string;
    readonly bookmarkId: string;
    readonly profileId: string;
  },
  tx?: Transaction,
): Promise<typeof Bookmarks.$inferSelect | null> => {
  const connection = getDatabaseConnection(tx);
  return connection
    .delete(Bookmarks)
    .where(
      and(
        eq(Bookmarks.id, bookmarkId),
        eq(Bookmarks.profileId, profileId),
        exists(
          connection
            .select({ id: AccountProfiles.id })
            .from(AccountProfiles)
            .innerJoin(Accounts, eq(Accounts.id, AccountProfiles.accountId))
            .innerJoin(Profiles, eq(Profiles.id, AccountProfiles.profileId))
            .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
            .where(
              and(
                eq(AccountProfiles.accountId, accountId),
                eq(AccountProfiles.profileId, Bookmarks.profileId),
                eq(Profiles.state, ProfileState.ACTIVE),
                eq(Accounts.state, AccountState.ACTIVE),
                eq(Instances.kind, InstanceKind.LOCAL),
                eq(Instances.state, InstanceState.ACTIVE),
              ),
            ),
        ),
      ),
    )
    .returning()
    .then(first)
    .then((bookmark) => bookmark ?? null);
};
