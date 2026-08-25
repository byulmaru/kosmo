import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import type * as CoreDb from '@kosmo/core/db';
import type {
  createPost as CreatePost,
  deletePost as DeletePost,
  repostPost as RepostPost,
} from '@kosmo/core/services';
import type {
  createReactionNotificationActivity as CreateReactionNotificationActivity,
  createReplyNotificationActivity as CreateReplyNotificationActivity,
  createRepostNotificationActivity as CreateRepostNotificationActivity,
  deleteReactionNotificationActivity as DeleteReactionNotificationActivity,
  deleteRepostNotificationActivity as DeleteRepostNotificationActivity,
} from './activities';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let createCorePost: typeof CreatePost;
let deletePost: typeof DeletePost;
let createReactionNotificationActivity: typeof CreateReactionNotificationActivity;
let deleteReactionNotificationActivity: typeof DeleteReactionNotificationActivity;
let createReplyNotificationActivity: typeof CreateReplyNotificationActivity;
let createRepostNotificationActivity: typeof CreateRepostNotificationActivity;
let deleteRepostNotificationActivity: typeof DeleteRepostNotificationActivity;
let repostPost: typeof RepostPost;

before(async () => {
  ({
    db,
    firstOrThrow,
    Instances,
    Notifications,
    pg,
    PostContents,
    Posts,
    ProfileFollows,
    Profiles,
    Reactions,
  } = await import('@kosmo/core/db'));
  ({
    createReactionNotificationActivity,
    createReplyNotificationActivity,
    createRepostNotificationActivity,
    deleteReactionNotificationActivity,
    deleteRepostNotificationActivity,
  } = await import('./activities'));
  ({ createPost: createCorePost, deletePost, repostPost } = await import('@kosmo/core/services'));
});

beforeEach(async () => {
  await db.delete(Notifications);
  await db.delete(ProfileFollows);
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Profiles);
  await db.delete(Instances);
});

after(async () => pg.end());

test('missing Post와 root Post는 Notification을 만들지 않는다', async () => {
  const author = await createProfile();
  const root = await createPost(author.id);

  await createReplyNotificationActivity(crypto.randomUUID());
  await createReplyNotificationActivity(root.id);

  assert.equal(await db.$count(Notifications), 0);
});

test('visible Reply는 정확한 recipient/source Notification을 한 번만 만든다', async () => {
  const recipient = await createProfile();
  const author = await createProfile();
  const parent = await createPost(recipient.id);
  const reply = await createPost(author.id, { replyParentId: parent.id });

  await createReplyNotificationActivity(reply.id);
  await createReplyNotificationActivity(reply.id);

  const notifications = await db.select().from(Notifications);
  assert.equal(notifications.length, 1);
  assert.deepEqual(
    notifications.map(({ data, kind, recipientProfileId, sourceId }) => ({
      data,
      kind,
      recipientProfileId,
      sourceId,
    })),
    [
      {
        data: {},
        kind: NotificationKind.REPLY,
        recipientProfileId: recipient.id,
        sourceId: reply.id,
      },
    ],
  );
});

test('Followers Reply는 recipient가 author를 follow할 때만 Notification을 만든다', async () => {
  const recipient = await createProfile();
  const author = await createProfile();
  const parent = await createPost(recipient.id);
  const reply = await createPost(author.id, {
    replyParentId: parent.id,
    visibility: PostVisibility.FOLLOWERS,
  });

  await createReplyNotificationActivity(reply.id);
  assert.equal(await db.$count(Notifications), 0);

  await db.insert(ProfileFollows).values({
    followeeProfileId: author.id,
    followerProfileId: recipient.id,
  });
  await createReplyNotificationActivity(reply.id);

  assert.equal(await db.$count(Notifications), 1);
});

test('자기 Reply는 Notification을 만들지 않는다', async () => {
  const author = await createProfile();
  const parent = await createPost(author.id);
  const reply = await createPost(author.id, { replyParentId: parent.id });

  await createReplyNotificationActivity(reply.id);

  assert.equal(await db.$count(Notifications), 0);
});

test('Reaction Notification Activities는 create와 delete retry에 멱등이다', async () => {
  const recipient = await createProfile();
  const actor = await createProfile();
  const post = await createPost(recipient.id);
  const reaction = await db
    .insert(Reactions)
    .values({ postId: post.id, profileId: actor.id, type: '❤️' })
    .returning()
    .then(firstOrThrow);

  await createReactionNotificationActivity(reaction.id);
  await createReactionNotificationActivity(reaction.id);

  const notifications = await db.select().from(Notifications);
  assert.deepEqual(
    notifications.map(({ kind, recipientProfileId, sourceId }) => ({
      kind,
      recipientProfileId,
      sourceId,
    })),
    [
      {
        kind: NotificationKind.REACTION,
        recipientProfileId: recipient.id,
        sourceId: reaction.id,
      },
    ],
  );

  await deleteReactionNotificationActivity(reaction.id);
  await deleteReactionNotificationActivity(reaction.id);
  assert.equal(await db.$count(Notifications), 0);
});

test('Repost Notification Activities는 create와 delete retry에 멱등이다', async () => {
  const recipient = await createProfile();
  const actor = await createProfile();
  const { post: source } = await createCorePost({
    document: postContentDocumentFromText('Repost source'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { repost } = await repostPost({
    actorProfileId: actor.id,
    origin: 'LOCAL',
    sourcePostId: source.id,
  });

  await createRepostNotificationActivity(repost.id);
  await createRepostNotificationActivity(repost.id);

  const notifications = await db.select().from(Notifications);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.kind, NotificationKind.REPOST);
  assert.equal(notifications[0]?.recipientProfileId, recipient.id);
  assert.equal(notifications[0]?.sourceId, repost.id);

  await deleteRepostNotificationActivity(repost.id);
  await deleteRepostNotificationActivity(repost.id);
  assert.equal(await db.$count(Notifications), 0);
});

test('Create Activity 전에 Repost가 Tombstone이면 성공한 no-op이다', async () => {
  const recipient = await createProfile();
  const actor = await createProfile();
  const { post: source } = await createCorePost({
    document: postContentDocumentFromText('Deleted Repost source'),
    origin: 'LOCAL',
    profileId: recipient.id,
    visibility: PostVisibility.PUBLIC,
  });
  const { repost } = await repostPost({
    actorProfileId: actor.id,
    origin: 'LOCAL',
    sourcePostId: source.id,
  });
  await deletePost({
    actorProfileId: actor.id,
    origin: 'LOCAL',
    postId: repost.id,
  });

  await assert.doesNotReject(createRepostNotificationActivity(repost.id));
  assert.equal(await db.$count(Notifications), 0);
});

const createProfile = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  return db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
};

const createPost = (
  profileId: string,
  {
    replyParentId,
    visibility = PostVisibility.PUBLIC,
  }: { replyParentId?: string; visibility?: PostVisibility } = {},
) =>
  db
    .insert(Posts)
    .values({
      profileId,
      replyParentId,
      state: PostState.ACTIVE,
      visibility,
    })
    .returning()
    .then(firstOrThrow);
