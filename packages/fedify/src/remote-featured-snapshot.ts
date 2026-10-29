import { db, first, Instances, ProfilePinnedPosts, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { generateProfilePinKey } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';

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
    const remote = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(and(eq(Profiles.id, profileId), eq(Instances.kind, InstanceKind.ACTIVITYPUB)))
      .limit(1)
      .then(first);
    if (!remote) {
      throw new Error('Remote profile not found');
    }
    await tx.delete(ProfilePinnedPosts).where(eq(ProfilePinnedPosts.profileId, profileId));

    let previous: ReturnType<typeof generateProfilePinKey> | null = null;
    if (postIds.length > 0) {
      await tx.insert(ProfilePinnedPosts).values(
        postIds.map((postId, position) => {
          previous = generateProfilePinKey(previous, null);
          return {
            orderKey: previous,
            position,
            postId,
            profileId,
          };
        }),
      );
    }
  });
};
