import { ActivityPubActors, db, first, ProfilePinnedPosts } from '@kosmo/core/db';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

export type RemoteFeaturedSnapshotInput = {
  profileId: string;
  actorUri: string | URL;
  featuredUri: string | URL | null;
  revision: number;
  postIds: readonly string[];
};

const uri = (value: string | URL) => value.toString();

const assertRevision = (revision: number) => {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError('Remote Featured revision must be a nonnegative integer.');
  }
};

/**
 * Replaces the remote Featured projection only when the Actor generation is
 * still current. The transaction rolls back the deletion if any candidate pin
 * cannot be inserted.
 */
export const replaceRemoteFeaturedSnapshot = async ({
  actorUri,
  featuredUri,
  postIds,
  profileId,
  revision,
}: RemoteFeaturedSnapshotInput): Promise<boolean> => {
  assertRevision(revision);

  return db.transaction(async (tx) => {
    const actor = await tx
      .update(ActivityPubActors)
      .set({ featuredRevision: sql`${ActivityPubActors.featuredRevision}` })
      .where(
        and(
          eq(ActivityPubActors.profileId, profileId),
          eq(ActivityPubActors.uri, uri(actorUri)),
          featuredUri === null
            ? isNull(ActivityPubActors.featuredUri)
            : eq(ActivityPubActors.featuredUri, uri(featuredUri)),
          eq(ActivityPubActors.featuredRevision, revision),
        ),
      )
      .returning({ id: ActivityPubActors.id })
      .then(first);

    if (!actor) {
      return false;
    }

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

    return true;
  });
};
