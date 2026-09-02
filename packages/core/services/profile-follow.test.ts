import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import {
  ActivityPubActors,
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
import {
  cancelProfileFollowRequest,
  followProfile,
  unfollowProfile,
} from './profile-follow.test-helpers';

const instanceIds: string[] = [];
const profileIds: string[] = [];

const createProfile = async (followPolicy: ProfileFollowPolicy = ProfileFollowPolicy.OPEN) => {
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

const createRemoteProfile = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  state = InstanceState.ACTIVE,
  withActor = true,
}: {
  followPolicy?: ProfileFollowPolicy;
  state?: InstanceState;
  withActor?: boolean;
} = {}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.remote.example`,
      kind: InstanceKind.ACTIVITYPUB,
      state,
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

  if (withActor) {
    await db.insert(ActivityPubActors).values({
      inboxUri: `https://${instance.domain}/users/${suffix}/inbox`,
      profileId: profile.id,
      sharedInboxUri: `https://${instance.domain}/inbox`,
      type: 'PERSON',
      uri: `https://${instance.domain}/users/${suffix}`,
    });
  }

  return profile;
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
    followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
    followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
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

test('Follow transaction은 실제 생성만 관계를 만들고 duplicate는 멱등 처리한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const created = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const duplicate = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const relation = getEstablishedFollow(created);

  assert.equal(created.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(getEstablishedFollow(duplicate).id, relation.id);
});

test('Follow transaction은 삭제 identity를 반환하고 no-op은 변경하지 않는다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const created = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const relation = getEstablishedFollow(created);
  const deleted = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const repeated = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  assert.equal(deleted.profileFollowId, relation.id);
  assert.equal(repeated.profileFollowId, null);
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

test('OPEN 정책 전환으로 pending request를 relation으로 승격하면 request 알림도 정리한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const pending = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(pending.result.kind, 'PENDING');
  if (pending.result.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }

  await db
    .update(Profiles)
    .set({ followPolicy: ProfileFollowPolicy.OPEN })
    .where(eq(Profiles.id, followee.id));

  const promoted = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(promoted.created, true);
  assert.equal(promoted.result.kind, 'ESTABLISHED');
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, pending.result.profileFollowRequest.id))
      .then((rows) => rows.length),
    0,
  );
});

test('follow action은 unavailable follower의 relation과 request 생성을 거부한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, follower.id));

  await assert.rejects(
    followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
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

test('follow action은 저장된 Profile origin pair에서 flow를 파생한다', async () => {
  const local = await createProfile();
  const localFollowee = await createProfile();
  const remoteFollower = await createRemoteProfile();
  const remoteTarget = await createRemoteProfile({ state: InstanceState.UNRESPONSIVE });

  assert.equal(
    (
      await followProfile({
        followerProfileId: local.id,
        followeeProfileId: localFollowee.id,
      })
    ).result.kind,
    'ESTABLISHED',
  );
  assert.equal(
    (
      await followProfile({
        followerProfileId: local.id,
        followeeProfileId: remoteTarget.id,
      })
    ).result.kind,
    'ESTABLISHED',
  );
  assert.equal(
    (
      await followProfile({
        followerProfileId: remoteFollower.id,
        followeeProfileId: localFollowee.id,
      })
    ).result.kind,
    'ESTABLISHED',
  );

  await assert.rejects(
    followProfile({
      followerProfileId: remoteFollower.id,
      followeeProfileId: remoteTarget.id,
    }),
    NotFoundError,
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
    followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
    NotFoundError,
  );
});

test('follow action은 저장 actor identity가 없는 remote profile을 숨긴다', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile({ withActor: false });

  await assert.rejects(
    followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
    NotFoundError,
  );
});

test('remote Follow transaction은 relation과 count를 멱등 처리한다', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile();
  const followed = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  const relation = await db
    .select()
    .from(ProfileFollows)
    .where(eq(ProfileFollows.followeeProfileId, followee.id))
    .then(firstOrThrow);
  const duplicateFollow = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  assert.equal(followed.created, true);
  assert.equal(getEstablishedFollow(followed).id, relation.id);
  assert.equal(followed.followerProfile.followingCount, 1);
  assert.equal(followed.followeeProfile.followersCount, 1);
  assert.equal(duplicateFollow.created, false);
  assert.equal(getEstablishedFollow(duplicateFollow).id, relation.id);
  assert.equal((await readProfile(follower.id)).followingCount, 1);
  assert.equal((await readProfile(followee.id)).followersCount, 1);
});

test('UNRESPONSIVE remote follow와 unfollow는 local projection만 변경한다', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile({
    state: InstanceState.UNRESPONSIVE,
  });

  const followed = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const unfollowed = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  assert.equal(followed.created, true);
  assert.equal(unfollowed.profileFollowId, getEstablishedFollow(followed).id);
  assert.equal((await readProfile(follower.id)).followingCount, 0);
  assert.equal((await readProfile(followee.id)).followersCount, 0);
});

test('UNRESPONSIVE approval request는 pending row를 저장하고 cancel로 제거한다', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    state: InstanceState.UNRESPONSIVE,
  });

  const first = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const duplicate = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(first.result.kind, 'PENDING');
  assert.equal(duplicate.result.kind, 'PENDING');
  if (first.result.kind !== 'PENDING' || duplicate.result.kind !== 'PENDING') {
    assert.fail('Expected pending profile follow requests');
  }
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.result.profileFollowRequest.id, first.result.profileFollowRequest.id);
  assert.equal((await readProfile(follower.id)).followingCount, 0);
  assert.equal((await readProfile(followee.id)).followersCount, 0);

  const canceled = await cancelProfileFollowRequest({
    actorProfileId: follower.id,
    profileFollowRequestId: first.result.profileFollowRequest.id,
  });
  assert.equal(canceled.profileFollowRequestId, first.result.profileFollowRequest.id);
  assert.equal(canceled.followerProfile.id, follower.id);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, first.result.profileFollowRequest.id))
      .then((rows) => rows.length),
    0,
  );
});

test('approval request transaction은 pending row를 보존하고 duplicate를 멱등 처리한다', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
  });

  const followed = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  const request = await db
    .select()
    .from(ProfileFollowRequests)
    .where(eq(ProfileFollowRequests.followeeProfileId, followee.id))
    .then(firstOrThrow);
  const duplicate = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  assert.equal(followed.created, true);
  assert.equal(followed.result.kind, 'PENDING');
  if (followed.result.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }
  assert.equal(followed.result.profileFollowRequest.id, request.id);
  assert.equal(followed.followerProfile.followingCount, 0);
  assert.equal(followed.followeeProfile.followersCount, 0);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.result.kind, 'PENDING');
  if (duplicate.result.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }
  assert.equal(duplicate.result.profileFollowRequest.id, request.id);
});

test('UNRESPONSIVE approval request cancel은 local row만 제거한다', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    state: InstanceState.UNRESPONSIVE,
  });
  const followed = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(followed.result.kind, 'PENDING');
  if (followed.result.kind !== 'PENDING') {
    assert.fail('Expected a pending profile follow request');
  }

  const canceled = await cancelProfileFollowRequest({
    actorProfileId: follower.id,
    profileFollowRequestId: followed.result.profileFollowRequest.id,
  });

  assert.equal(canceled.profileFollowRequestId, followed.result.profileFollowRequest.id);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, followed.result.profileFollowRequest.id))
      .then((rows) => rows.length),
    0,
  );
});

test('remote Unfollow transaction은 relation과 count를 감소시킨다', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile();
  const followed = await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  const unfollowed = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(unfollowed.profileFollowId, getEstablishedFollow(followed).id);
  assert.equal(unfollowed.followerProfile.followingCount, 0);
  assert.equal(unfollowed.followeeProfile.followersCount, 0);
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, getEstablishedFollow(followed).id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal((await readProfile(follower.id)).followingCount, 0);
  assert.equal((await readProfile(followee.id)).followersCount, 0);
});

test('unfollow action은 대상 조회, 관계 삭제와 count 감소를 함께 소유한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  await followProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
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
