import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import {
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
} from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
} from '../enums';
import { NotFoundError } from '../error';
import { postContentDocumentFromText } from '../post-content/server';
import {
  createFollowNotification,
  createReactionNotification,
  createRepostNotification,
  deleteNotificationBySource,
} from './notification';
import { createPost, repostPost } from './post';
import { followProfile, unfollowProfile } from './profile-follow';

const instanceIds: string[] = [];
const profileIds: string[] = [];

const createProfile = async (kind: InstanceKind = InstanceKind.LOCAL) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);
  return profile;
};

const readNotifications = (sourceId: string) =>
  db.select().from(Notifications).where(eq(Notifications.sourceId, sourceId));

const createReaction = async (authorProfileId: string, recipientProfileId: string) => {
  const post = await db
    .insert(Posts)
    .values({
      profileId: recipientProfileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);

  return db
    .insert(Reactions)
    .values({ postId: post.id, profileId: authorProfileId, type: '🎉' })
    .returning()
    .then(firstOrThrow);
};

const createContentPost = (profileId: string) =>
  createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId,
    visibility: PostVisibility.PUBLIC,
  }).then(({ post }) => post);

const getEstablishedFollow = (result: Awaited<ReturnType<typeof followProfile>>) => {
  if (result.result.kind !== 'ESTABLISHED') {
    assert.fail('Expected an established profile follow');
  }
  return result.result.profileFollow;
};

after(async () => {
  if (profileIds.length > 0) {
    await db.delete(Notifications).where(inArray(Notifications.recipientProfileId, profileIds));
    await db.delete(Reactions).where(inArray(Reactions.profileId, profileIds));
    const postIds = await db
      .select({ id: Posts.id })
      .from(Posts)
      .where(inArray(Posts.profileId, profileIds))
      .then((rows) => rows.map(({ id }) => id));
    if (postIds.length > 0) {
      await db.update(Posts).set({ currentContentId: null }).where(inArray(Posts.id, postIds));
      await db.delete(PostContents).where(inArray(PostContents.postId, postIds));
    }
    await db.delete(Posts).where(inArray(Posts.profileId, profileIds));
    await db
      .delete(ProfileFollows)
      .where(
        or(
          inArray(ProfileFollows.followerProfileId, profileIds),
          inArray(ProfileFollows.followeeProfileId, profileIds),
        ),
      );
    await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
  }
  if (instanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, instanceIds));
  }
  await pg.end();
});

test('Follow 알림은 source에서 Local Recipient와 Related Profile을 파생한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );

  const [notification] = await readNotifications(profileFollow.id);
  assert.ok(notification);
  assert.equal(notification.kind, NotificationKind.FOLLOW);
  assert.equal(notification.sourceId, profileFollow.id);
  assert.equal(notification.recipientProfileId, profileFollow.followeeProfileId);
  assert.equal(profileFollow.followerProfileId, follower.id);
  assert.deepEqual(notification.data, {});
  assert.equal(notification.readAt, null);
});

test('Follow 알림은 materialize된 Remote Follower도 같은 mapping으로 저장한다', async () => {
  const follower = await createProfile(InstanceKind.ACTIVITYPUB);
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );

  const [notification] = await readNotifications(profileFollow.id);
  assert.equal(notification?.recipientProfileId, followee.id);
  assert.equal(profileFollow.followerProfileId, follower.id);
});

test('Follow 알림은 Remote Recipient source를 거부한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(InstanceKind.ACTIVITYPUB);
  const profileFollow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);

  await assert.rejects(createFollowNotification(profileFollow.id), NotFoundError);
  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Follow 알림은 존재하지 않거나 삭제된 source를 거부한다', async () => {
  const missingSourceId = crypto.randomUUID();
  await assert.rejects(createFollowNotification(missingSourceId), NotFoundError);
  assert.deepEqual(await readNotifications(missingSourceId), []);

  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  await unfollowProfile({ followerProfileId: follower.id, followeeProfileId: followee.id });

  await assert.rejects(createFollowNotification(profileFollow.id), NotFoundError);
  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Follow 알림 생성과 삭제는 반복 및 동시 호출에 idempotent하다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );

  await Promise.all([
    createFollowNotification(profileFollow.id),
    createFollowNotification(profileFollow.id),
  ]);
  assert.equal((await readNotifications(profileFollow.id)).length, 1);

  await createFollowNotification(profileFollow.id);
  assert.equal((await readNotifications(profileFollow.id)).length, 1);

  await deleteNotificationBySource(NotificationKind.FOLLOW, profileFollow.id);
  await deleteNotificationBySource(NotificationKind.FOLLOW, profileFollow.id);
  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Unfollow 뒤 Re-follow는 새 source ID로 새 알림을 저장한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const firstFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  const deleted = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(deleted.profileFollowId, firstFollow.id);

  const secondFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  assert.notEqual(secondFollow.id, firstFollow.id);
  assert.deepEqual(await readNotifications(firstFollow.id), []);
  assert.equal((await readNotifications(secondFollow.id)).length, 1);
});

test('Reaction 알림은 source에서 Recipient와 Related 객체를 파생하고 idempotent하다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const reaction = await createReaction(author.id, recipient.id);

  await Promise.all([
    createReactionNotification(reaction.id),
    createReactionNotification(reaction.id),
  ]);

  const [notification] = await readNotifications(reaction.id);
  assert.ok(notification);
  assert.equal(notification.kind, NotificationKind.REACTION);
  assert.equal(notification.recipientProfileId, recipient.id);
  assert.equal(notification.sourceId, reaction.id);
  assert.deepEqual(notification.data, {});
});

test('Reaction 알림은 자기 Post와 Remote Recipient에서 no-op이다', async () => {
  const self = await createProfile();
  const selfReaction = await createReaction(self.id, self.id);
  await createReactionNotification(selfReaction.id);
  assert.deepEqual(await readNotifications(selfReaction.id), []);

  const author = await createProfile();
  const remoteRecipient = await createProfile(InstanceKind.ACTIVITYPUB);
  const remoteReaction = await createReaction(author.id, remoteRecipient.id);
  await createReactionNotification(remoteReaction.id);
  assert.deepEqual(await readNotifications(remoteReaction.id), []);
});

test('Reaction 알림은 존재하지 않는 source를 거부한다', async () => {
  await assert.rejects(createReactionNotification(crypto.randomUUID()), NotFoundError);
});

test('Repost 알림은 direct Source에서 Recipient와 Related 객체를 파생하고 idempotent하다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const original = await createContentPost(recipient.id);
  const reply = await createContentPost(recipient.id);
  await db.update(Posts).set({ replyParentId: original.id }).where(eq(Posts.id, reply.id));
  const quote = await createContentPost(recipient.id);
  await db.update(Posts).set({ repostSourceId: original.id }).where(eq(Posts.id, quote.id));

  for (const relatedPost of [original, reply, quote]) {
    const { repost } = await repostPost({
      actorProfileId: author.id,
      sourcePostId: relatedPost.id,
    });

    await Promise.all([createRepostNotification(repost.id), createRepostNotification(repost.id)]);

    const [notification] = await readNotifications(repost.id);
    assert.ok(notification);
    assert.equal(notification.kind, NotificationKind.REPOST);
    assert.equal(notification.recipientProfileId, recipient.id);
    assert.equal(notification.sourceId, repost.id);
    assert.equal(repost.profileId, author.id);
    assert.equal(repost.repostSourceId, relatedPost.id);
    assert.deepEqual(notification.data, {});
  }
});

test('Repost 알림은 자기 Post와 Remote Recipient에서 no-op이다', async () => {
  const self = await createProfile();
  const selfSource = await createContentPost(self.id);
  const { repost: selfRepost } = await repostPost({
    actorProfileId: self.id,
    sourcePostId: selfSource.id,
  });
  await createRepostNotification(selfRepost.id);
  assert.deepEqual(await readNotifications(selfRepost.id), []);

  const author = await createProfile();
  const remoteRecipient = await createProfile(InstanceKind.ACTIVITYPUB);
  const remoteSource = await createContentPost(remoteRecipient.id);
  const { repost: remoteRepost } = await repostPost({
    actorProfileId: author.id,
    sourcePostId: remoteSource.id,
  });
  await createRepostNotification(remoteRepost.id);
  assert.deepEqual(await readNotifications(remoteRepost.id), []);
});

test('Repost 알림은 존재하지 않거나 pure Repost가 아닌 source를 거부한다', async () => {
  await assert.rejects(createRepostNotification(crypto.randomUUID()), NotFoundError);

  const author = await createProfile();
  const contentPost = await createContentPost(author.id);
  await assert.rejects(createRepostNotification(contentPost.id), NotFoundError);
});
