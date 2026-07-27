import { ActivityPubPosts, db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const postIdSchema = z.uuid().refine((value) => value === value.toLowerCase());

export const isCanonicalPostId = (value: string): boolean => postIdSchema.safeParse(value).success;

export const resolveActivityPubPostUri = async (postId: string): Promise<URL | undefined> => {
  if (!isCanonicalPostId(postId)) {
    return undefined;
  }

  const row = await db
    .select({
      instanceCanonicalOrigin: Instances.canonicalOrigin,
      instanceKind: Instances.kind,
      remoteUri: ActivityPubPosts.uri,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .where(eq(Posts.id, postId))
    .limit(1)
    .then(first);

  if (!row) {
    return undefined;
  }
  if (row.instanceKind === InstanceKind.LOCAL) {
    return row.instanceCanonicalOrigin
      ? new URL(`/ap/note/${postId}`, row.instanceCanonicalOrigin)
      : undefined;
  }

  return row.remoteUri ? new URL(row.remoteUri) : undefined;
};
