import { Note, PUBLIC_COLLECTION } from '@fedify/fedify';
import { Temporal } from '@js-temporal/polyfill';
import {
  Files,
  first,
  firstOrThrow,
  getDatabaseConnection,
  Instances,
  PostMentions,
  Posts,
  PostSnapshots,
  Profiles,
} from '@kosmo/db';
import { FileState, PostSnapshotState, PostVisibility } from '@kosmo/enum';
import { nodes } from '@kosmo/tiptap';
import { generateHTML } from '@tiptap/html';
import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { match } from 'ts-pattern';
import { ProfileManager } from '.';
import type { Transaction } from '@kosmo/db';
import type { JSONContent } from '@tiptap/core';

type CreateParams = {
  tx?: Transaction;
  profileId: string;
  content: JSONContent;
  visibility: PostVisibility;
  replyToPostId?: string;
  mediaIds?: string[] | null;
};

export const create = async ({ tx, profileId, content, mediaIds, ...data }: CreateParams) => {
  const db = getDatabaseConnection(tx);

  const post = await db
    .insert(Posts)
    .values({ profileId, ...data })
    .returning()
    .then(firstOrThrow);

  await db.insert(PostSnapshots).values({ postId: post.id, content, mediaIds });
  if (mediaIds) {
    await db.update(Files).set({ state: FileState.PERMANENT }).where(inArray(Files.id, mediaIds));
  }

  return post;
};

type GetActivityPubNoteParams = {
  postId: string;
  tx?: Transaction;
};

export const getUri = (postId: string, webDomain: string) => {
  return new URL(`/post/${postId}`, webDomain);
};

export const getUrl = (postId: string, handle: string, webDomain: string) => {
  return new URL(`/@${handle}/post/${postId}`, webDomain);
};

export const getActivityPubNote = async ({ postId, tx }: GetActivityPubNoteParams) => {
  const db = getDatabaseConnection(tx);

  const ReplyPosts = alias(Posts, 'reply_posts');

  const post = await db
    .select({
      id: Posts.id,
      content: PostSnapshots.content,
      visibility: Posts.visibility,
      createdAt: Posts.createdAt,
      profile: {
        id: Profiles.id,
        handle: Profiles.handle,
      },
      instance: {
        webDomain: Instances.webDomain,
      },
      replyToPost: {
        id: ReplyPosts.id,
        profileId: ReplyPosts.profileId,
      },
    })
    .from(Posts)
    .innerJoin(
      PostSnapshots,
      and(eq(Posts.id, PostSnapshots.postId), eq(PostSnapshots.state, PostSnapshotState.ACTIVE)),
    )
    .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
    .innerJoin(Instances, eq(Profiles.instanceId, Instances.id))
    .leftJoin(ReplyPosts, eq(ReplyPosts.id, Posts.replyToPostId))
    .where(eq(Posts.id, postId))
    .then(first);

  if (!post) {
    return { note: null, profileId: null };
  }

  const postMentionProfileUris = await db
    .select({
      id: Profiles.id,
      uri: Profiles.uri,
      webDomain: Instances.webDomain,
    })
    .from(PostMentions)
    .innerJoin(Profiles, eq(PostMentions.profileId, Profiles.id))
    .innerJoin(Instances, eq(Profiles.instanceId, Instances.id))
    .where(eq(PostMentions.postId, postId))
    .then((rows) =>
      rows.map((row) =>
        row.uri ? new URL(row.uri) : ProfileManager.getUri(row.id, row.webDomain!),
      ),
    );

  return {
    note: new Note({
      id: getUri(post.id, post.instance.webDomain!),
      attribution: ProfileManager.getUri(post.profile.id, post.instance.webDomain!),
      tos: match(post.visibility)
        .with(PostVisibility.PUBLIC, () => [PUBLIC_COLLECTION])
        .with(PostVisibility.UNLISTED, PostVisibility.FOLLOWER, () => [
          ProfileManager.getFollowersUri(post.profile.id, post.instance.webDomain!),
        ])
        .with(PostVisibility.DIRECT, () => postMentionProfileUris)
        .exhaustive(),

      ccs: match(post.visibility)
        .with(PostVisibility.PUBLIC, () => [
          ProfileManager.getFollowersUri(post.profile.id, post.instance.webDomain!),
          ...postMentionProfileUris,
        ])
        .with(PostVisibility.UNLISTED, () => [PUBLIC_COLLECTION, ...postMentionProfileUris])
        .with(PostVisibility.FOLLOWER, () => postMentionProfileUris)
        .with(PostVisibility.DIRECT, () => [])
        .exhaustive(),

      published: Temporal.Instant.fromEpochMilliseconds(post.createdAt.valueOf()),
      content: generateHTML(post.content, nodes),
      url: getUrl(post.id, post.profile.handle, post.instance.webDomain!),
    }),

    profileId: post.profile.id,
  };
};
