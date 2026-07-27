import { ActivityPubPosts, db, first, Posts, Profiles } from '@kosmo/core/db';
import { eq } from 'drizzle-orm';

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isCanonicalPostId = (value: string): boolean => canonicalUuidPattern.test(value);

export const getLocalPostUri = (canonicalOrigin: string | URL, postId: string): URL =>
  new URL(`/ap/note/${postId}`, canonicalOrigin);

export const resolveActivityPubPostUri = async ({
  canonicalOrigin,
  localInstanceId,
  postId,
}: {
  canonicalOrigin: string | URL;
  localInstanceId: string;
  postId: string;
}): Promise<URL | undefined> => {
  if (!isCanonicalPostId(postId)) {
    return undefined;
  }

  const row = await db
    .select({ instanceId: Profiles.instanceId, remoteUri: ActivityPubPosts.uri })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .where(eq(Posts.id, postId))
    .limit(1)
    .then(first);

  if (!row) {
    return undefined;
  }
  if (row.instanceId === localInstanceId) {
    return getLocalPostUri(canonicalOrigin, postId);
  }

  return row.remoteUri ? new URL(row.remoteUri) : undefined;
};
