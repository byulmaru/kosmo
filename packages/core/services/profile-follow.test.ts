import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db, firstOrThrow, Instances, pg, ProfileFollows, Profiles } from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { createProfileFollow, unfollowProfile } from './profile-follow';

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
    createProfileFollow({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    createProfileFollow({ followerProfileId: follower.id, followeeProfileId: followee.id }),
  ]);

  assert.equal(results.filter(({ created }) => created).length, 1);
  assert.equal(results[0].profileFollow.id, results[1].profileFollow.id);
  assert.equal((await readProfile(follower.id)).followingCount, 1);
  assert.equal((await readProfile(followee.id)).followersCount, 1);

  await db
    .delete(ProfileFollows)
    .where(
      and(
        eq(ProfileFollows.followerProfileId, follower.id),
        eq(ProfileFollows.followeeProfileId, followee.id),
      ),
    );
  await assert.rejects(
    unfollowProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    NotFoundError,
  );
});

test('follow action의 도메인 오류는 GraphQL field 이름을 포함하지 않는다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);

  await assert.rejects(
    createProfileFollow({ followerProfileId: follower.id, followeeProfileId: followee.id }),
    (error: unknown) => error instanceof ConflictError && error.field === undefined,
  );
});

test('follow action은 동시에 비활성화된 대상에 관계를 생성하지 않는다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  let follow: ReturnType<typeof createProfileFollow> | undefined;

  await db.transaction(async (tx) => {
    await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .where(eq(Profiles.id, followee.id))
      .for('update');

    follow = createProfileFollow({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    });

    for (let attempts = 0; attempts < 100; attempts += 1) {
      const [blocked] = await pg<{ blocked: boolean }[]>`
        select exists (
          select 1
          from pg_stat_activity
          where datname = current_database()
            and pid <> pg_backend_pid()
            and wait_event_type = 'Lock'
            and query like '%"profile"%'
        ) as blocked
      `;
      if (blocked?.blocked) {
        break;
      }
      if (attempts === 99) {
        assert.fail('follow query did not wait for the profile row lock');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await tx
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, followee.id));
  });

  await assert.rejects(follow, NotFoundError);
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.followeeProfileId, followee.id))
      .then((rows) => rows.length),
    0,
  );
});

test('unfollow action은 대상 조회, 관계 삭제와 count 감소를 함께 소유한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  await createProfileFollow({ followerProfileId: follower.id, followeeProfileId: followee.id });

  const deleted = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const duplicate = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  assert.ok(deleted.profileFollowId);
  assert.equal(duplicate.profileFollowId, null);
  assert.equal((await readProfile(follower.id)).followingCount, 0);
  assert.equal((await readProfile(followee.id)).followersCount, 0);
});

test('SUSPENDED target unfollow는 관계와 count를 보존한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  await createProfileFollow({ followerProfileId: follower.id, followeeProfileId: followee.id });
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
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.id),
          eq(ProfileFollows.followeeProfileId, followee.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
  assert.equal((await readProfile(follower.id)).followingCount, 1);
  assert.equal((await readProfile(followee.id)).followersCount, 1);
});
