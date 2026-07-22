import { and, eq } from 'drizzle-orm';
import { Bookmarks, first, getDatabaseConnection } from '../db';
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
    bookmarkId,
    profileId,
  }: {
    readonly bookmarkId: string;
    readonly profileId: string;
  },
  tx?: Transaction,
): Promise<typeof Bookmarks.$inferSelect | null> =>
  getDatabaseConnection(tx)
    .delete(Bookmarks)
    .where(and(eq(Bookmarks.id, bookmarkId), eq(Bookmarks.profileId, profileId)))
    .returning()
    .then(first)
    .then((bookmark) => bookmark ?? null);
