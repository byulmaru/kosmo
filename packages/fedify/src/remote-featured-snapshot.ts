import { db, ProfilePinnedPosts } from '@kosmo/core/db';
import { and, eq, isNotNull } from 'drizzle-orm';

export type RemoteFeaturedSnapshotInput = {
  profileId: string;
  postIds: readonly string[];
};

/**
 * Replaces all remote Featured pins atomically. The transaction rolls back the
 * deletion if any candidate pin cannot be inserted.
 */
export const replaceRemoteFeaturedSnapshot = async ({
  postIds,
  profileId,
}: RemoteFeaturedSnapshotInput): Promise<void> => {
  // ponytail: overlapping refreshes may finish out of order; serialize per actor if stale pins become an observed problem.
  await db.transaction(async (tx) => {
    await tx
      .delete(ProfilePinnedPosts)
      .where(
        and(eq(ProfilePinnedPosts.profileId, profileId), isNotNull(ProfilePinnedPosts.position)),
      );

    if (postIds.length > 0) {
      await tx.insert(ProfilePinnedPosts).values(
        postIds.map((postId, position) => ({
          position,
          postId,
          profileId,
        })),
      );
    }
  });
};
