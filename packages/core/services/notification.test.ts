import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
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
  ProfileState,
} from '../enums';
import { NotFoundError } from '../error';
import {
  createFollowNotification,
  createReactionNotification,
  createReplyNotification,
  deleteNotificationBySource,
} from './notification';
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

const createReply = async (
  authorProfileId: string,
  recipientProfileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) => {
  const parent = await db
    .insert(Posts)
    .values({
      profileId: recipientProfileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  const reply = await db
    .insert(Posts)
    .values({
      profileId: authorProfileId,
      replyParentId: parent.id,
      state: PostState.ACTIVE,
      visibility,
    })
    .returning()
    .then(firstOrThrow);
  return { parent, reply };
};

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

test('Reply 알림은 source에서 Recipient와 Related 객체를 파생하고 idempotent하다', async () => {
  const author = await createProfile();
  const parentAuthor = await createProfile();
  const { reply } = await createReply(author.id, parentAuthor.id);

  await Promise.all([createReplyNotification(reply.id), createReplyNotification(reply.id)]);

  const rows = await db.select().from(Notifications).where(eq(Notifications.sourceId, reply.id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, NotificationKind.REPLY);
  assert.equal(rows[0]?.recipientProfileId, parentAuthor.id);
  assert.notEqual(author.id, parentAuthor.id);
  assert.deepEqual(rows[0]?.data, {});
});

test('self-reply, Remote Recipient와 Recipient에게 보이지 않는 Reply는 no-op이다', async () => {
  const self = await createProfile();
  const selfReply = await createReply(self.id, self.id);
  await createReplyNotification(selfReply.reply.id);
  assert.deepEqual(await readNotifications(selfReply.reply.id), []);

  const author = await createProfile();
  const remoteRecipient = await createProfile(InstanceKind.ACTIVITYPUB);
  const remoteReply = await createReply(author.id, remoteRecipient.id);
  await createReplyNotification(remoteReply.reply.id);
  assert.deepEqual(await readNotifications(remoteReply.reply.id), []);

  const invisibleAuthor = await createProfile();
  const localRecipient = await createProfile();
  const invisibleReply = await createReply(
    invisibleAuthor.id,
    localRecipient.id,
    PostVisibility.FOLLOWERS,
  );
  await createReplyNotification(invisibleReply.reply.id);
  assert.deepEqual(await readNotifications(invisibleReply.reply.id), []);
});

test('unavailable source, Parent, Recipient와 Reply Author는 생성 시 no-op이다', async () => {
  const assertUnavailableNoOp = async (
    mutate: (fixture: {
      author: typeof Profiles.$inferSelect;
      parent: typeof Posts.$inferSelect;
      recipient: typeof Profiles.$inferSelect;
      reply: typeof Posts.$inferSelect;
    }) => Promise<void>,
  ) => {
    const author = await createProfile();
    const recipient = await createProfile();
    const { parent, reply } = await createReply(author.id, recipient.id);
    await mutate({ author, parent, recipient, reply });
    await createReplyNotification(reply.id);
    assert.deepEqual(await readNotifications(reply.id), []);
  };

  await assertUnavailableNoOp(async ({ reply }) => {
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, reply.id));
  });
  await assertUnavailableNoOp(async ({ parent }) => {
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, parent.id));
  });
  await assertUnavailableNoOp(async ({ recipient }) => {
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, recipient.id));
  });
  await assertUnavailableNoOp(async ({ recipient }) => {
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, recipient.instanceId));
  });
  await assertUnavailableNoOp(async ({ author }) => {
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, author.id));
  });
  await assertUnavailableNoOp(async ({ author }) => {
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, author.instanceId));
  });
});

test('존재하지 않거나 Reply가 아닌 source는 거부한다', async () => {
  const missingSourceId = crypto.randomUUID();
  await assert.rejects(createReplyNotification(missingSourceId), NotFoundError);
  assert.deepEqual(await readNotifications(missingSourceId), []);

  const author = await createProfile();
  const post = await db
    .insert(Posts)
    .values({
      profileId: author.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  await assert.rejects(createReplyNotification(post.id), NotFoundError);
  assert.deepEqual(await readNotifications(post.id), []);
});
