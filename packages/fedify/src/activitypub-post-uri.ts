import { ActivityPubPosts, db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { and, eq, isNotNull } from 'drizzle-orm';
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

export const findContentPostByActivityPubUri = async (uri: URL): Promise<string | undefined> => {
  if (uri.protocol !== 'http:' && uri.protocol !== 'https:') {
    return undefined;
  }

  const remotePost = await db
    .select({ id: Posts.id })
    .from(ActivityPubPosts)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
    .where(and(eq(ActivityPubPosts.uri, uri.href), isNotNull(Posts.currentContentId)))
    .limit(1)
    .then(first);
  if (remotePost) {
    return remotePost.id;
  }

  const match = /^\/ap\/note\/([^/]+)$/.exec(uri.pathname);
  const postId = match?.[1];
  if (!postId || !isCanonicalPostId(postId)) {
    return undefined;
  }

  const localPost = await db
    .select({ canonicalOrigin: Instances.canonicalOrigin, id: Posts.id })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Posts.id, postId),
        isNotNull(Posts.currentContentId),
        eq(Instances.kind, InstanceKind.LOCAL),
      ),
    )
    .limit(1)
    .then(first);

  return localPost?.canonicalOrigin &&
    new URL(`/ap/note/${localPost.id}`, localPost.canonicalOrigin).href === uri.href
    ? localPost.id
    : undefined;
};
