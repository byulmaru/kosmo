import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { NotFoundError } from '../error';
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

const getEstablishedFollow = (result: Awaited<ReturnType<typeof followProfile>>) => {
  if (result.result.kind !== 'ESTABLISHED') {
    assert.fail('Expected an established profile follow');
  }
  return result.result.profileFollow;
};

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
  assert.equal(getEstablishedFollow(results[0]).id, getEstablishedFollow(results[1]).id);
  assert.equal(results[0].followerProfile.followingCount, 1);
  assert.equal(results[0].followeeProfile.followersCount, 1);
  assert.equal(results[1].followerProfile.followingCount, 1);
  assert.equal(results[1].followeeProfile.followersCount, 1);
  assert.equal((await readProfile(follower.id)).followingCount, 1);
  assert.equal((await readProfile(followee.id)).followersCount, 1);
});

test('follow action은 승인 필요 profile에 pending request를 만들고 count를 유지한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);

  const result = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  assert.equal(result.result.kind, 'PENDING');
  if (result.result.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }
  assert.ok(result.result.profileFollowRequest.id);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.followerProfileId, follower.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal((await readProfile(follower.id)).followingCount, 0);
  assert.equal((await readProfile(followee.id)).followersCount, 0);
});

test('follow action은 unavailable follower의 relation과 request 생성을 거부한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, follower.id));

  await assert.rejects(
    followProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    NotFoundError,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.followerProfileId, follower.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.followerProfileId, follower.id))
      .then((rows) => rows.length),
    0,
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
  const result = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const profileFollow = getEstablishedFollow(result);
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
