import { Note } from '@fedify/vocab';
import {
  ActivityPubPosts,
  first,
  getDatabaseConnection,
  Instances,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Context } from '@fedify/fedify';
import type { DatabaseHandle } from '@kosmo/core/db';

const postIdSchema = z.uuid().refine((value) => value === value.toLowerCase());

export const isCanonicalPostId = (value: string): boolean => postIdSchema.safeParse(value).success;

export const resolveActivityPubPostUri = async (
  postId: string,
  handle?: DatabaseHandle,
): Promise<URL | undefined> => {
  if (!isCanonicalPostId(postId)) {
    return undefined;
  }

  const row = await getDatabaseConnection(handle)
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

export const findPostByActivityPubUri = async (
  context: Pick<Context<unknown>, 'canonicalOrigin' | 'parseUri'>,
  uri: URL,
  handle?: DatabaseHandle,
): Promise<string | undefined> => {
  if (uri.protocol !== 'http:' && uri.protocol !== 'https:') {
    return undefined;
  }

  const localObject = context.parseUri(uri);
  if (localObject) {
    if (localObject.type !== 'object' || localObject.class !== Note) {
      return undefined;
    }

    const postId = localObject.values.id;
    if (!isCanonicalPostId(postId)) {
      return undefined;
    }

    return getDatabaseConnection(handle)
      .select({ id: Posts.id })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(Posts.id, postId),
          eq(Instances.kind, InstanceKind.LOCAL),
          eq(Instances.canonicalOrigin, context.canonicalOrigin),
        ),
      )
      .limit(1)
      .then(first)
      .then((post) => post?.id);
  }

  const remotePost = await getDatabaseConnection(handle)
    .select({ id: Posts.id })
    .from(ActivityPubPosts)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
    .where(eq(ActivityPubPosts.uri, uri.href))
    .limit(1)
    .then(first);

  return remotePost?.id;
};
