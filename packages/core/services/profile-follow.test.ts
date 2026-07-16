import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import { db, firstOrThrow, Instances, Notifications, pg, ProfileFollows, Profiles } from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { createFollowNotification } from './notification';
import { disableProfile } from './profile';
import { followProfile, unfollowProfile } from './profile-follow';

const instanceIds: string[] = [];
const profileIds: string[] = [];

const createProfile = async (
  followPolicy = ProfileFollowPolicy.OPEN,
  kind = InstanceKind.LOCAL,
) => {
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
      followPolicy,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);
  return profile;
};

const readProfile = (id: string) =>
  db.select().from(Profiles).where(eq(Profiles.id, id)).then(firstOrThrow);
const readNotifications = (sourceId: string) =>
  db.select().from(Notifications).where(eq(Notifications.sourceId, sourceId));

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

test('follow action은 관계와 저장 count를 idempotent하게 갱신한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const notifiedSourceIds: string[] = [];
  const notify = (sourceId: string) => {
    notifiedSourceIds.push(sourceId);
    return Promise.resolve();
  };

  const results = await Promise.all([
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }, notify),
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }, notify),
  ]);

  assert.equal(results.filter(({ created }) => created).length, 1);
  assert.equal(results[0].profileFollow.id, results[1].profileFollow.id);
  assert.equal(results[0].followerProfile.followingCount, 1);
  assert.equal(results[0].followeeProfile.followersCount, 1);
  assert.equal(results[1].followerProfile.followingCount, 1);
  assert.equal(results[1].followeeProfile.followersCount, 1);
  assert.equal((await readProfile(follower.id)).followingCount, 1);
  assert.equal((await readProfile(followee.id)).followersCount, 1);
  assert.deepEqual(notifiedSourceIds, [results[0].profileFollow.id]);
});

test('follow action은 commit 뒤 알림 생성을 await한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  let releaseNotification!: () => void;
  let notificationStarted!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseNotification = resolve;
  });
  const started = new Promise<void>((resolve) => {
    notificationStarted = resolve;
  });
  let settled = false;

  const resultPromise = followProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    async (sourceId) => {
      assert.equal(
        await db
          .select()
          .from(ProfileFollows)
          .where(eq(ProfileFollows.id, sourceId))
          .then((rows) => rows.length),
        1,
      );
      notificationStarted();
      await release;
    },
  ).then((result) => {
    settled = true;
    return result;
  });

  await started;
  assert.equal(settled, false);
  releaseNotification();
  assert.equal((await resultPromise).created, true);
});

test('follow action은 deny와 evaluator·저장 오류에도 commit을 보존한다', async () => {
  const cases = [
    (sourceId: string) => createFollowNotification(sourceId, () => Promise.resolve(false)),
    (sourceId: string) =>
      createFollowNotification(sourceId, () => Promise.reject(new Error('eligibility failed'))),
    () => Promise.reject(new Error('storage failed')),
  ];

  for (const createNotification of cases) {
    const follower = await createProfile();
    const followee = await createProfile();
    const result = await followProfile(
      { followerProfileId: follower.id, followeeProfileId: followee.id },
      createNotification,
    );

    assert.equal(result.created, true);
    assert.equal(
      await db
        .select()
        .from(ProfileFollows)
        .where(eq(ProfileFollows.id, result.profileFollow.id))
        .then((rows) => rows.length),
      1,
    );
    assert.deepEqual(await readNotifications(result.profileFollow.id), []);
  }
});

test('follow action은 materialize된 Remote Follower도 같은 알림 경계를 사용한다', async () => {
  const follower = await createProfile(ProfileFollowPolicy.OPEN, InstanceKind.ACTIVITYPUB);
  const followee = await createProfile();

  const result = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  assert.equal((await readNotifications(result.profileFollow.id)).length, 1);
});

test('follow action의 도메인 오류는 GraphQL field 이름을 포함하지 않는다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);

  await assert.rejects(
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    (error: unknown) => error instanceof ConflictError && error.field === undefined,
  );
});

test('follow action은 SUSPENDED instance의 profile을 숨긴다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, followee.instanceId));

  await assert.rejects(
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    NotFoundError,
  );
});

test('unfollow action은 SUSPENDED instance의 관계를 보존한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const { profileFollow } = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, followee.instanceId));

  await assert.rejects(
    unfollowProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    NotFoundError,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, profileFollow.id))
      .then((rows) => rows.length),
    1,
  );
});

test('follow action은 federation delivery가 없는 remote profile을 숨긴다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  await db
    .update(Instances)
    .set({ kind: InstanceKind.ACTIVITYPUB })
    .where(eq(Instances.id, followee.instanceId));

  await assert.rejects(
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    NotFoundError,
  );
});

test('unfollow action은 대상 조회, 관계 삭제와 count 감소를 함께 소유한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const { profileFollow } = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal((await readNotifications(profileFollow.id)).length, 1);

  const deleted = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const duplicate = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  assert.ok(deleted.profileFollowId);
  assert.equal(deleted.followerProfile.followingCount, 0);
  assert.equal(deleted.followeeProfile.followersCount, 0);
  assert.equal(duplicate.profileFollowId, null);
  assert.equal(duplicate.followerProfile.followingCount, 0);
  assert.equal(duplicate.followeeProfile.followersCount, 0);
  assert.equal((await readProfile(follower.id)).followingCount, 0);
  assert.equal((await readProfile(followee.id)).followersCount, 0);
  assert.deepEqual(await readNotifications(profileFollow.id), []);

  await disableProfile(followee.id);
  assert.equal(deleted.followeeProfile.state, ProfileState.ACTIVE);
  assert.equal((await readProfile(followee.id)).state, ProfileState.DISABLED);
});

test('unfollow action은 cleanup 오류에도 관계 삭제를 보존하고 duplicate에서 재호출하지 않는다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const { profileFollow } = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  let cleanupCalls = 0;
  const failCleanup = () => {
    cleanupCalls += 1;
    return Promise.reject(new Error('cleanup failed'));
  };

  const deleted = await unfollowProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    failCleanup,
  );
  const duplicate = await unfollowProfile(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    failCleanup,
  );

  assert.equal(deleted.profileFollowId, profileFollow.id);
  assert.equal(duplicate.profileFollowId, null);
  assert.equal(cleanupCalls, 1);
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, profileFollow.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal((await readNotifications(profileFollow.id)).length, 1);
});
