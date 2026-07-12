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
import {
  approveProfileFollowRequest,
  cancelProfileFollowRequest,
  createProfileFollow,
  rejectProfileFollowRequest,
  unfollowProfile,
} from './profile-follow';
import type {
  ActivityPubFollowPort,
  FollowRequestActionPorts,
  FollowRequestNotificationPort,
} from './profile-follow';

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

const createPorts = () => {
  const notificationEvents: string[] = [];
  const activityEvents: string[] = [];
  const notifications: FollowRequestNotificationPort = {
    created: async ({ request }) => void notificationEvents.push(`created:${request.id}`),
    removed: async ({ request, reason }) =>
      void notificationEvents.push(`removed:${request.id}:${reason}`),
  };
  const activityPub: ActivityPubFollowPort = {
    requestCreated: async ({ request }) => void activityEvents.push(`created:${request.id}`),
    respond: async ({ request, disposition }) =>
      void activityEvents.push(`respond:${request.id}:${disposition}`),
  };
  const ports: FollowRequestActionPorts = { notifications, activityPub };
  return { activityEvents, notificationEvents, ports };
};

after(async () => {
  if (profileIds.length > 0) {
    await db
      .delete(ProfileFollowRequests)
      .where(
        or(
          inArray(ProfileFollowRequests.followerProfileId, profileIds),
          inArray(ProfileFollowRequests.followeeProfileId, profileIds),
        ),
      );
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

  assert.ok(results.every((result) => result.kind === 'follow'));
  assert.equal(results.filter(({ created }) => created).length, 1);
  assert.equal(results[0].profileFollow?.id, results[1].profileFollow?.id);
  assert.equal((await readProfile(follower.id)).followingCount, 1);
  assert.equal((await readProfile(followee.id)).followersCount, 1);
});

test('follow action은 승인제 대상의 pending request를 idempotent하게 생성한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const { notificationEvents, ports } = createPorts();

  const first = await createProfileFollow(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    ports,
  );
  const second = await createProfileFollow(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    ports,
  );

  assert.equal(first.kind, 'request');
  assert.equal(second.kind, 'request');
  assert.equal(first.profileFollowRequest?.id, second.profileFollowRequest?.id);
  assert.equal(notificationEvents.length, 1);
  assert.equal((await readProfile(follower.id)).followingCount, 0);
  assert.equal((await readProfile(followee.id)).followersCount, 0);
});

test('follow request 승인 action은 요청 삭제, 관계 생성과 count 증가를 함께 소유한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const { activityEvents, notificationEvents, ports } = createPorts();
  const pending = await createProfileFollow(
    { followerProfileId: follower.id, followeeProfileId: followee.id },
    ports,
  );
  assert.equal(pending.kind, 'request');
  if (pending.kind !== 'request') {
    return;
  }

  const result = await approveProfileFollowRequest(
    { requestId: pending.profileFollowRequest.id, actorProfileId: followee.id },
    ports,
  );

  assert.equal(result.profileFollow.followerProfileId, follower.id);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, pending.profileFollowRequest.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal((await readProfile(follower.id)).followingCount, 1);
  assert.equal((await readProfile(followee.id)).followersCount, 1);
  assert.deepEqual(notificationEvents, [
    `created:${pending.profileFollowRequest.id}`,
    `removed:${pending.profileFollowRequest.id}:accepted`,
  ]);
  assert.deepEqual(activityEvents, [`respond:${pending.profileFollowRequest.id}:accepted`]);
});

test('follow request 처리 action은 follower와 followee 역할을 구분한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const rejected = await createProfileFollow({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(rejected.kind, 'request');
  if (rejected.kind !== 'request') {
    return;
  }

  await assert.rejects(
    rejectProfileFollowRequest({
      requestId: rejected.profileFollowRequest.id,
      actorProfileId: follower.id,
    }),
    NotFoundError,
  );
  await rejectProfileFollowRequest({
    requestId: rejected.profileFollowRequest.id,
    actorProfileId: followee.id,
  });

  const cancelled = await createProfileFollow({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(cancelled.kind, 'request');
  if (cancelled.kind !== 'request') {
    return;
  }
  await cancelProfileFollowRequest({
    requestId: cancelled.profileFollowRequest.id,
    actorProfileId: follower.id,
  });

  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.followeeProfileId, followee.id))
      .then((rows) => rows.length),
    0,
  );
});

test('remote follow request action은 correlation port를 최초 생성에만 호출한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const { activityEvents, ports } = createPorts();
  const input = {
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
    source: {
      kind: 'activitypub' as const,
      activityId: new URL('https://remote.example/activities/follow-1'),
      actorId: new URL('https://remote.example/users/alice'),
      objectId: new URL('https://local.example/ap/actor/followee'),
    },
  };

  await createProfileFollow(input, ports);
  await createProfileFollow(input, ports);

  assert.equal(activityEvents.length, 1);
  assert.match(activityEvents[0] ?? '', /^created:/);
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
