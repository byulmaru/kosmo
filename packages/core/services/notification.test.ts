import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import { db, firstOrThrow, Instances, Notifications, pg, ProfileFollows, Profiles } from '../db';
import { InstanceKind, InstanceState, NotificationKind, ProfileFollowPolicy } from '../enums';
import { NotFoundError } from '../error';
import { createFollowNotification, deleteNotificationBySource } from './notification';
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
const skipNotification = () => Promise.resolve();

after(async () => {
  if (profileIds.length > 0) {
    await db.delete(Notifications).where(inArray(Notifications.recipientProfileId, profileIds));
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
  const { profileFollow } = await followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );

  let evaluated = false;
  await createFollowNotification(profileFollow.id, (input) => {
    evaluated = true;
    assert.deepEqual(input, {
      kind: NotificationKind.FOLLOW,
      recipientProfileId: followee.id,
      relatedProfileId: follower.id,
    });
    return Promise.resolve(true);
  });

  assert.equal(evaluated, true);

  const [notification] = await readNotifications(profileFollow.id);
  assert.ok(notification);
  assert.equal(notification.kind, NotificationKind.FOLLOW);
  assert.equal(notification.sourceId, profileFollow.id);
  assert.equal(notification.recipientProfileId, profileFollow.followeeProfileId);
  assert.equal(profileFollow.followerProfileId, follower.id);
  assert.deepEqual(notification.data, {});
  assert.equal(notification.readAt, null);
});

test('Follow 알림 eligibility가 deny이면 저장하지 않는다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const { profileFollow } = await followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );

  await createFollowNotification(profileFollow.id, () => Promise.resolve(false));

  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Follow 알림 eligibility 오류는 fail-closed로 저장하지 않고 반환한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const { profileFollow } = await followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );
  const error = new Error('eligibility failed');

  await assert.rejects(
    createFollowNotification(profileFollow.id, () => Promise.reject(error)),
    error,
  );
  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Follow 알림은 materialize된 Remote Follower도 같은 mapping으로 저장한다', async () => {
  const follower = await createProfile(InstanceKind.ACTIVITYPUB);
  const followee = await createProfile();
  const { profileFollow } = await followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );

  await createFollowNotification(profileFollow.id);

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
  const { profileFollow } = await followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );
  await unfollowProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );

  await assert.rejects(createFollowNotification(profileFollow.id), NotFoundError);
  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Follow 알림 생성과 삭제는 반복 및 동시 호출에 idempotent하다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const { profileFollow } = await followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );

  assert.deepEqual(await readNotifications(profileFollow.id), []);

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
  const firstFollow = await followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );
  await createFollowNotification(firstFollow.profileFollow.id);

  const deleted = await unfollowProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );
  assert.equal(deleted.profileFollowId, firstFollow.profileFollow.id);
  await deleteNotificationBySource(NotificationKind.FOLLOW, firstFollow.profileFollow.id);

  const secondFollow = await followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    skipNotification,
  );
  await createFollowNotification(secondFollow.profileFollow.id);

  assert.notEqual(secondFollow.profileFollow.id, firstFollow.profileFollow.id);
  assert.deepEqual(await readNotifications(firstFollow.profileFollow.id), []);
  assert.equal((await readNotifications(secondFollow.profileFollow.id)).length, 1);
});
