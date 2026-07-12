import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import { db, firstOrThrow, Instances, pg, ProfileFollows, Profiles } from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError } from '../error';
import { disableProfile } from './profile';
import { followProfile, unfollowProfile } from './profile-follow';

const instanceIds: string[] = [];
const profileIds: string[] = [];

const createProfile = async (followPolicy = ProfileFollowPolicy.OPEN) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
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

after(async () => {
  if (profileIds.length > 0) {
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

  const results = await Promise.all([
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
  ]);

  assert.equal(results.filter(({ created }) => created).length, 1);
  assert.equal(results[0].profileFollow.id, results[1].profileFollow.id);
  assert.equal(results[0].followerProfile.followingCount, 1);
  assert.equal(results[0].followeeProfile.followersCount, 1);
  assert.equal(results[1].followerProfile.followingCount, 1);
  assert.equal(results[1].followeeProfile.followersCount, 1);
  assert.equal((await readProfile(follower.id)).followingCount, 1);
  assert.equal((await readProfile(followee.id)).followersCount, 1);
});

test('follow action의 도메인 오류는 GraphQL field 이름을 포함하지 않는다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);

  await assert.rejects(
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    (error: unknown) => error instanceof ConflictError && error.field === undefined,
  );
});

test('unfollow action은 대상 조회, 관계 삭제와 count 감소를 함께 소유한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  await followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id });

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

  await disableProfile(followee.id);
  assert.equal(deleted.followeeProfile.state, ProfileState.ACTIVE);
  assert.equal((await readProfile(followee.id)).state, ProfileState.DISABLED);
});
