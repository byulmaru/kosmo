import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
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
import { NotFoundError, PermissionDeniedError } from '../error';
import * as profileFollowRequestLifecycle from './profile-follow-request';
import type { Transaction } from '../db';

type ApproveProfileFollowRequest = (
  input: {
    actorProfileId: string;
    profileFollowRequestId: string;
  },
  tx?: Transaction,
) => Promise<{
  followeeProfile: typeof Profiles.$inferSelect;
  followerProfile: typeof Profiles.$inferSelect;
  profileFollow: typeof ProfileFollows.$inferSelect;
  profileFollowRequestId: string;
}>;

type RejectProfileFollowRequest = (
  input: {
    actorProfileId: string;
    profileFollowRequestId: string;
  },
  tx?: Transaction,
) => Promise<{
  followeeProfile: typeof Profiles.$inferSelect;
  profileFollowRequestId: string;
}>;

type CancelProfileFollowRequest = (
  input: {
    actorProfileId: string;
    profileFollowRequestId: string;
  },
  tx?: Transaction,
) => Promise<{
  followerProfile: typeof Profiles.$inferSelect;
  profileFollowRequestId: string;
}>;

const lifecycle = profileFollowRequestLifecycle as typeof profileFollowRequestLifecycle & {
  approveProfileFollowRequest?: ApproveProfileFollowRequest;
  cancelProfileFollowRequest?: CancelProfileFollowRequest;
  rejectProfileFollowRequest?: RejectProfileFollowRequest;
};

after(async () => pg.end());

const createProfile = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  instanceKind = InstanceKind.LOCAL,
}: {
  followPolicy?: ProfileFollowPolicy;
  instanceKind?: InstanceKind;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  return db
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
};

const createLocalProfile = (followPolicy = ProfileFollowPolicy.OPEN) =>
  createProfile({ followPolicy });

const createPendingRequest = async () => {
  const follower = await createLocalProfile();
  const followee = await createLocalProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const followed = await profileFollowRequestLifecycle.ensureProfileFollowRequest({
    followeeProfileId: followee.id,
    followerProfileId: follower.id,
  });
  assert.equal(followed.kind, 'PENDING');
  if (followed.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }
  return { followee, follower, request: followed.profileFollowRequest };
};

test('pair 조회와 승인은 request를 relation으로 원자적으로 전환한다', async () => {
  assert.equal(typeof lifecycle.approveProfileFollowRequest, 'function');

  const follower = await createLocalProfile();
  const followee = await createLocalProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const followed = await profileFollowRequestLifecycle.ensureProfileFollowRequest({
    followeeProfileId: followee.id,
    followerProfileId: follower.id,
  });
  assert.equal(followed.kind, 'PENDING');
  if (followed.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }

  const found = await lifecycle.findProfileFollowRequestByPair({
    followeeProfileId: followee.id,
    followerProfileId: follower.id,
  });
  assert.equal(found?.id, followed.profileFollowRequest.id);

  const approved = await lifecycle.approveProfileFollowRequest!({
    actorProfileId: followee.id,
    profileFollowRequestId: found!.id,
  });

  assert.equal(approved.profileFollowRequestId, found!.id);
  assert.equal(approved.profileFollow.followerProfileId, follower.id);
  assert.equal(approved.profileFollow.followeeProfileId, followee.id);
  assert.equal(approved.followerProfile.followingCount, 1);
  assert.equal(approved.followeeProfile.followersCount, 1);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, found!.id))
      .then((rows) => rows.length),
    0,
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
});

test('followee는 request를 거절하고 actor Profile과 삭제 ID를 받는다', async () => {
  assert.equal(typeof lifecycle.rejectProfileFollowRequest, 'function');
  const { followee, follower, request } = await createPendingRequest();

  const rejected = await lifecycle.rejectProfileFollowRequest!({
    actorProfileId: followee.id,
    profileFollowRequestId: request.id,
  });

  assert.equal(rejected.profileFollowRequestId, request.id);
  assert.equal(rejected.followeeProfile.id, followee.id);
  assert.equal(rejected.followeeProfile.followersCount, 0);
  assert.equal(
    (await db.select().from(Profiles).where(eq(Profiles.id, follower.id)).then(firstOrThrow))
      .followingCount,
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.id))
      .then((rows) => rows.length),
    0,
  );
  await assert.rejects(
    lifecycle.rejectProfileFollowRequest!({
      actorProfileId: followee.id,
      profileFollowRequestId: request.id,
    }),
    NotFoundError,
  );
});

test('follower는 request를 취소하고 actor Profile과 삭제 ID를 받는다', async () => {
  assert.equal(typeof lifecycle.cancelProfileFollowRequest, 'function');
  const { followee, follower, request } = await createPendingRequest();

  const canceled = await lifecycle.cancelProfileFollowRequest!({
    actorProfileId: follower.id,
    profileFollowRequestId: request.id,
  });

  assert.equal(canceled.profileFollowRequestId, request.id);
  assert.equal(canceled.followerProfile.id, follower.id);
  assert.equal(canceled.followerProfile.followingCount, 0);
  assert.equal(
    (await db.select().from(Profiles).where(eq(Profiles.id, followee.id)).then(firstOrThrow))
      .followersCount,
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.id))
      .then((rows) => rows.length),
    0,
  );
});

test('participant가 아닌 actor는 request transition을 실행할 수 없다', async () => {
  assert.equal(typeof lifecycle.rejectProfileFollowRequest, 'function');
  const { request } = await createPendingRequest();
  const stranger = await createLocalProfile();

  await assert.rejects(
    lifecycle.rejectProfileFollowRequest!({
      actorProfileId: stranger.id,
      profileFollowRequestId: request.id,
    }),
    PermissionDeniedError,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.id))
      .then((rows) => rows.length),
    1,
  );
});

test('pending request 생성은 같은 pair에서 멱등이다', async () => {
  const follower = await createLocalProfile();
  const followee = await createLocalProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const input = { followeeProfileId: followee.id, followerProfileId: follower.id };

  const [firstResult, secondResult] = await Promise.all([
    profileFollowRequestLifecycle.ensureProfileFollowRequest(input),
    profileFollowRequestLifecycle.ensureProfileFollowRequest(input),
  ]);
  assert.equal(firstResult.kind, 'PENDING');
  assert.equal(secondResult.kind, 'PENDING');
  if (firstResult.kind !== 'PENDING' || secondResult.kind !== 'PENDING') {
    assert.fail('Expected pending profile follow requests');
  }

  assert.equal(firstResult.profileFollowRequest.id, secondResult.profileFollowRequest.id);
  assert.equal([firstResult, secondResult].filter(({ created }) => created).length, 1);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.followerProfileId, follower.id))
      .then((rows) => rows.length),
    1,
  );
});

test('승인은 unavailable participant를 거부하고 request를 보존한다', async () => {
  const { followee, follower, request } = await createPendingRequest();
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, follower.id));

  await assert.rejects(
    lifecycle.approveProfileFollowRequest!({
      actorProfileId: followee.id,
      profileFollowRequestId: request.id,
    }),
    NotFoundError,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.id))
      .then((rows) => rows.length),
    1,
  );
});

test('거절과 취소는 unavailable counterpart가 있어도 pending row를 정리한다', async () => {
  const rejectedPair = await createPendingRequest();
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, rejectedPair.follower.id));
  const rejected = await lifecycle.rejectProfileFollowRequest!({
    actorProfileId: rejectedPair.followee.id,
    profileFollowRequestId: rejectedPair.request.id,
  });
  assert.equal(rejected.profileFollowRequestId, rejectedPair.request.id);

  const canceledPair = await createPendingRequest();
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, canceledPair.followee.instanceId));
  const canceled = await lifecycle.cancelProfileFollowRequest!({
    actorProfileId: canceledPair.follower.id,
    profileFollowRequestId: canceledPair.request.id,
  });
  assert.equal(canceled.profileFollowRequestId, canceledPair.request.id);
});

test('SUSPENDED remote counterpart가 있어도 거절과 취소로 pending row를 정리한다', async () => {
  const remoteFollower = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const localFollowee = await createLocalProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const rejectedRequest = await lifecycle.ensureProfileFollowRequest({
    followeeProfileId: localFollowee.id,
    followerProfileId: remoteFollower.id,
  });
  assert.equal(rejectedRequest.kind, 'PENDING');
  if (rejectedRequest.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, remoteFollower.instanceId));
  const rejected = await lifecycle.rejectProfileFollowRequest!({
    actorProfileId: localFollowee.id,
    profileFollowRequestId: rejectedRequest.profileFollowRequest.id,
  });
  assert.equal(rejected.profileFollowRequestId, rejectedRequest.profileFollowRequest.id);

  const localFollower = await createLocalProfile();
  const remoteFollowee = await createProfile({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    instanceKind: InstanceKind.ACTIVITYPUB,
  });
  const canceledRequest = await lifecycle.ensureProfileFollowRequest({
    followeeProfileId: remoteFollowee.id,
    followerProfileId: localFollower.id,
  });
  assert.equal(canceledRequest.kind, 'PENDING');
  if (canceledRequest.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, remoteFollowee.instanceId));
  const canceled = await lifecycle.cancelProfileFollowRequest!({
    actorProfileId: localFollower.id,
    profileFollowRequestId: canceledRequest.profileFollowRequest.id,
  });
  assert.equal(canceled.profileFollowRequestId, canceledRequest.profileFollowRequest.id);
});

test('승인은 SUSPENDED remote participant를 거부하고 request를 보존한다', async () => {
  const remoteFollower = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const localFollowee = await createLocalProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const request = await lifecycle.ensureProfileFollowRequest({
    followeeProfileId: localFollowee.id,
    followerProfileId: remoteFollower.id,
  });
  assert.equal(request.kind, 'PENDING');
  if (request.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, remoteFollower.instanceId));

  await assert.rejects(
    lifecycle.approveProfileFollowRequest!({
      actorProfileId: localFollowee.id,
      profileFollowRequestId: request.profileFollowRequest.id,
    }),
    NotFoundError,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.profileFollowRequest.id))
      .then((rows) => rows.length),
    1,
  );
});

test('승인은 기존 relation을 재사용하고 count를 중복 증가시키지 않는다', async () => {
  const { followee, follower, request } = await createPendingRequest();
  const existing = await db
    .insert(ProfileFollows)
    .values({ followeeProfileId: followee.id, followerProfileId: follower.id })
    .returning()
    .then(firstOrThrow);
  await db.update(Profiles).set({ followingCount: 1 }).where(eq(Profiles.id, follower.id));
  await db.update(Profiles).set({ followersCount: 1 }).where(eq(Profiles.id, followee.id));

  const approved = await lifecycle.approveProfileFollowRequest!({
    actorProfileId: followee.id,
    profileFollowRequestId: request.id,
  });
  assert.equal(approved.profileFollow.id, existing.id);
  assert.equal(approved.followerProfile.followingCount, 1);
  assert.equal(approved.followeeProfile.followersCount, 1);
});

test('동시 승인은 성공 개수와 무관하게 relation과 count를 중복하지 않는다', async () => {
  const { followee, follower, request } = await createPendingRequest();
  await Promise.allSettled([
    lifecycle.approveProfileFollowRequest!({
      actorProfileId: followee.id,
      profileFollowRequestId: request.id,
    }),
    lifecycle.approveProfileFollowRequest!({
      actorProfileId: followee.id,
      profileFollowRequestId: request.id,
    }),
  ]);

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.followerProfileId, follower.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    (await db.select().from(Profiles).where(eq(Profiles.id, follower.id)).then(firstOrThrow))
      .followingCount,
    1,
  );
  assert.equal(
    (await db.select().from(Profiles).where(eq(Profiles.id, followee.id)).then(firstOrThrow))
      .followersCount,
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.id))
      .then((rows) => rows.length),
    0,
  );
});

test('caller rollback은 승인 request/relation/count 전이를 모두 되돌린다', async () => {
  const { followee, follower, request } = await createPendingRequest();

  await assert.rejects(
    db.transaction(async (tx) => {
      await lifecycle.approveProfileFollowRequest!(
        { actorProfileId: followee.id, profileFollowRequestId: request.id },
        tx,
      );
      throw new Error('rollback');
    }),
    /rollback/,
  );

  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.followerProfileId, follower.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    (await db.select().from(Profiles).where(eq(Profiles.id, follower.id)).then(firstOrThrow))
      .followingCount,
    0,
  );
  assert.equal(
    (await db.select().from(Profiles).where(eq(Profiles.id, followee.id)).then(firstOrThrow))
      .followersCount,
    0,
  );
});
