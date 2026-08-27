import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
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
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import {
  executeProfileFollowPairTransition,
  executeProfileFollowRemoval,
  hydrateProfileFollowPairTransition,
  loadPendingFollowRequestSnapshot,
} from './profile-follow-command';
import type { ProfileFollowPairTransitionInput } from './profile-follow-command';

const profileIds: string[] = [];
const instanceIds: string[] = [];

const createProfile = async (followPolicy: ProfileFollowPolicy = ProfileFollowPolicy.OPEN) => {
  const suffix = crypto.randomUUID();
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

const createRemoteProfile = async (
  state: InstanceState,
  followPolicy: ProfileFollowPolicy = ProfileFollowPolicy.OPEN,
) => {
  const suffix = crypto.randomUUID();
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
  await db.insert(ActivityPubActors).values({
    inboxUri: `https://${suffix}.remote.example/inbox`,
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: `https://${suffix}.remote.example/users/${suffix}`,
  });
  return profile;
};

after(async () => {
  if (profileIds.length > 0) {
    await db
      .delete(ProfileFollowRequests)
      .where(
        and(
          inArray(ProfileFollowRequests.followerProfileId, profileIds),
          inArray(ProfileFollowRequests.followeeProfileId, profileIds),
        ),
      );
    await db
      .delete(ProfileFollows)
      .where(
        and(
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

test('open Follow stores the Workflow candidate entity ID and reconstructs a retry', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const candidateProfileFollowId = crypto.randomUUID();
  const input: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      origin: 'LOCAL',
    },
    candidateRowId: candidateProfileFollowId,
  };

  const first = await executeProfileFollowPairTransition(input);
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  assert.equal(first.nextState, 'ESTABLISHED');
  assert.equal(first.result.commandKind, 'FOLLOW');
  assert.equal(first.result.created, true);
  assert.equal(first.result.profileFollowId, candidateProfileFollowId);
  const hydrated = await hydrateProfileFollowPairTransition(first.result);
  assert.equal(hydrated.followerProfile.id, follower.id);
  assert.equal(hydrated.followeeProfile.id, followee.id);
  assert.equal(hydrated.profileFollow?.id, candidateProfileFollowId);
  assert.deepEqual(first.effectPlan, [
    {
      kind: 'CREATE',
      input: {
        origin: 'LOCAL',
        sendActivityPub: false,
        sourceId: candidateProfileFollowId,
        sourceKind: 'FOLLOW',
        transition: 'FOLLOW',
      },
    },
  ]);

  const retry = await executeProfileFollowPairTransition(input);
  assert.deepEqual(retry, first);
});

test('ActivityPub delivery eligibility는 transition transaction에서 고정한다', async () => {
  const follower = await createProfile();

  for (const [state, sendActivityPub] of [
    [InstanceState.ACTIVE, true],
    [InstanceState.UNRESPONSIVE, false],
  ] as const) {
    const followee = await createRemoteProfile(state);
    const profileFollowId = crypto.randomUUID();
    const followed = await executeProfileFollowPairTransition({
      pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
      command: {
        kind: 'FOLLOW',
        followerProfileId: follower.id,
        followeeProfileId: followee.id,
        origin: 'LOCAL',
      },
      candidateRowId: profileFollowId,
    });
    assert.equal(followed.ok, true);
    if (!followed.ok || followed.result.commandKind !== 'FOLLOW') {
      continue;
    }
    const followEffect = followed.effectPlan[0]?.input;
    assert.equal(
      followEffect && 'sendActivityPub' in followEffect ? followEffect.sendActivityPub : undefined,
      sendActivityPub,
    );

    const removed = await executeProfileFollowRemoval({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      expectedRowId: profileFollowId,
      origin: 'LOCAL',
      transition: 'UNFOLLOW',
      snapshot: followed.result.profileFollowSnapshot,
    });
    assert.equal(removed.ok, true);
    if (removed.ok) {
      const removalEffect = removed.effectPlan[0]?.input;
      assert.equal(
        removalEffect && 'sendActivityPub' in removalEffect
          ? removalEffect.sendActivityPub
          : undefined,
        sendActivityPub,
      );
    }
  }
});

test('ActivityPub request cancel도 transition 시점 eligibility를 기록한다', async () => {
  const follower = await createProfile();

  for (const [state, sendActivityPub] of [
    [InstanceState.ACTIVE, true],
    [InstanceState.UNRESPONSIVE, false],
  ] as const) {
    const followee = await createRemoteProfile(state, ProfileFollowPolicy.APPROVAL_REQUIRED);
    const pending = await executeProfileFollowPairTransition({
      pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
      command: {
        kind: 'FOLLOW',
        followerProfileId: follower.id,
        followeeProfileId: followee.id,
        origin: 'LOCAL',
      },
      candidateRowId: crypto.randomUUID(),
    });
    assert.equal(pending.ok, true);
    if (!pending.ok || pending.result.commandKind !== 'FOLLOW') {
      continue;
    }
    const requestId = pending.result.profileFollowRequestId!;
    const canceled = await executeProfileFollowPairTransition({
      pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
      command: {
        actorProfileId: follower.id,
        expectedRowId: requestId,
        followerProfileId: follower.id,
        followeeProfileId: followee.id,
        kind: 'CANCEL',
        origin: 'LOCAL',
      },
    });
    assert.equal(canceled.ok, true);
    if (canceled.ok) {
      const effect = canceled.effectPlan[0]?.input;
      assert.equal(
        effect && 'sendActivityPub' in effect ? effect.sendActivityPub : undefined,
        sendActivityPub,
      );
    }
  }
});

test('hydrate preserves a committed Follow row after a concurrent terminal removal', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollowId = crypto.randomUUID();
  const committed = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      origin: 'LOCAL',
    },
    candidateRowId: profileFollowId,
  });
  assert.equal(committed.ok, true);
  if (!committed.ok || committed.result.commandKind !== 'FOLLOW') {
    return;
  }
  assert.equal(committed.result.profileFollowId, profileFollowId);
  assert.ok(committed.result.profileFollowSnapshot);

  const removed = await executeProfileFollowRemoval({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
    expectedRowId: profileFollowId,
    origin: 'LOCAL',
    transition: 'UNFOLLOW',
    snapshot: {
      id: committed.result.profileFollowSnapshot.id,
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      createdAt: committed.result.profileFollowSnapshot.createdAt,
    },
  });
  assert.equal(removed.ok, true);

  const hydrated = await hydrateProfileFollowPairTransition(committed.result);
  assert.equal(hydrated.profileFollow?.id, profileFollowId);
  assert.equal(hydrated.profileFollow?.followerProfileId, follower.id);
  assert.equal(hydrated.profileFollow?.followeeProfileId, followee.id);
  assert.equal(
    hydrated.profileFollow?.createdAt.toString(),
    committed.result.profileFollowSnapshot.createdAt,
  );
});

test('hydrate preserves a committed Follow Request after a concurrent cancellation', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const profileFollowRequestId = crypto.randomUUID();
  const committed = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      origin: 'LOCAL',
    },
    candidateRowId: profileFollowRequestId,
  });
  assert.equal(committed.ok, true);
  if (!committed.ok || committed.result.commandKind !== 'FOLLOW') {
    return;
  }
  assert.equal(committed.result.profileFollowRequestId, profileFollowRequestId);
  assert.ok(committed.result.profileFollowRequestSnapshot);

  const canceled = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    pendingSnapshot: {
      id: profileFollowRequestId,
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      createdAt: committed.result.profileFollowRequestSnapshot.createdAt,
    },
    command: {
      kind: 'CANCEL',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      expectedRowId: profileFollowRequestId,
      origin: 'LOCAL',
      actorProfileId: follower.id,
    },
  });
  assert.equal(canceled.ok, true);

  const hydrated = await hydrateProfileFollowPairTransition(committed.result);
  assert.equal(hydrated.profileFollowRequest?.id, profileFollowRequestId);
  assert.equal(hydrated.profileFollowRequest?.followerProfileId, follower.id);
  assert.equal(hydrated.profileFollowRequest?.followeeProfileId, followee.id);
  assert.equal(
    hydrated.profileFollowRequest?.createdAt.toString(),
    committed.result.profileFollowRequestSnapshot.createdAt,
  );
});

test('unavailable inbound Accept remains pending without a candidate Follow effect', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const requestId = crypto.randomUUID();
  const follow = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      origin: 'LOCAL',
    },
    candidateRowId: requestId,
  });
  assert.equal(follow.ok, true);
  if (!follow.ok || follow.pendingSnapshot === undefined) {
    return;
  }

  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, followee.instanceId));

  const accepted = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'ACCEPT',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      expectedRowId: requestId,
      origin: 'ACTIVITYPUB',
    },
    followCandidateId: crypto.randomUUID(),
    pendingSnapshot: follow.pendingSnapshot,
  });

  assert.equal(accepted.ok, true);
  if (!accepted.ok) {
    return;
  }
  assert.equal(accepted.nextState, 'PENDING');
  assert.equal(accepted.result.kind, 'NOOP');
  assert.equal(accepted.result.profileFollowId, undefined);
  assert.deepEqual(accepted.effectPlan, []);
});

test('approval-required Follow remains pending and exact terminal rejection uses its snapshot', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const candidateProfileFollowRequestId = crypto.randomUUID();
  const followInput: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      origin: 'LOCAL',
    },
    candidateRowId: candidateProfileFollowRequestId,
  };
  const created = await executeProfileFollowPairTransition(followInput);
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  assert.equal(created.nextState, 'PENDING');
  assert.equal(created.result.profileFollowRequestId, candidateProfileFollowRequestId);

  const duplicate = await executeProfileFollowPairTransition({
    ...followInput,
    candidateRowId: crypto.randomUUID(),
  });
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) {
    return;
  }
  assert.equal(duplicate.nextState, 'PENDING');
  assert.ok(duplicate.pendingSnapshot);
  assert.equal(duplicate.pendingSnapshot.id, candidateProfileFollowRequestId);
  assert.equal(duplicate.pendingSnapshot.followerProfileId, follower.id);
  assert.equal(duplicate.pendingSnapshot.followeeProfileId, followee.id);

  const snapshot = await loadPendingFollowRequestSnapshot({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    expectedRowId: candidateProfileFollowRequestId,
  });
  assert.ok(snapshot);

  const rejectInput: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    pendingSnapshot: snapshot,
    command: {
      kind: 'REJECT',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      expectedRowId: candidateProfileFollowRequestId,
      origin: 'LOCAL',
      actorProfileId: followee.id,
    },
  };
  const rejected = await executeProfileFollowPairTransition(rejectInput);
  assert.equal(rejected.ok, true);
  if (!rejected.ok) {
    return;
  }
  assert.equal(rejected.nextState, 'REJECTED');
  assert.equal(rejected.result.commandKind, 'REJECT');
  assert.equal(rejected.result.changed, true);
  assert.equal(rejected.effectPlan[0]?.kind, 'DELETE');
  if (rejected.effectPlan[0]?.kind === 'DELETE') {
    assert.equal(rejected.effectPlan[0].input.sourceId, candidateProfileFollowRequestId);
    assert.equal(rejected.effectPlan[0].input.createdAt, snapshot.createdAt);
  }

  const retry = await executeProfileFollowPairTransition(rejectInput);
  assert.deepEqual(retry, rejected);
});

test('stale terminal command does not remove a different request generation', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const currentRequestId = crypto.randomUUID();
  const created = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      origin: 'LOCAL',
    },
    candidateRowId: currentRequestId,
  });
  assert.equal(created.ok, true);

  const stale = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'CANCEL',
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
      expectedRowId: crypto.randomUUID(),
      origin: 'LOCAL',
      actorProfileId: follower.id,
    },
  });
  assert.equal(stale.ok, true);
  if (!stale.ok) {
    return;
  }
  assert.equal(stale.result.commandKind, 'CANCEL');
  assert.equal(stale.result.changed, false);
  assert.equal(stale.effectPlan.length, 0);
  assert.equal(
    (await db.select().from(ProfileFollowRequests)).some((row) => row.id === currentRequestId),
    true,
  );
});

test('remote terminal command stays pending when availability guard preserves the request', async () => {
  const rejectedPair = {
    follower: await createProfile(),
    followee: await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED),
  };
  const rejectedRequest = await db
    .insert(ProfileFollowRequests)
    .values({
      followerProfileId: rejectedPair.follower.id,
      followeeProfileId: rejectedPair.followee.id,
    })
    .returning()
    .then(firstOrThrow);
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, rejectedPair.follower.instanceId));

  const rejected = await executeProfileFollowPairTransition({
    pair: {
      followerProfileId: rejectedPair.follower.id,
      followeeProfileId: rejectedPair.followee.id,
    },
    pendingSnapshot: {
      id: rejectedRequest.id,
      followerProfileId: rejectedRequest.followerProfileId,
      followeeProfileId: rejectedRequest.followeeProfileId,
      createdAt: rejectedRequest.createdAt.toString(),
    },
    command: {
      kind: 'REJECT',
      followerProfileId: rejectedPair.follower.id,
      followeeProfileId: rejectedPair.followee.id,
      expectedRowId: rejectedRequest.id,
      origin: 'ACTIVITYPUB',
    },
  });
  assert.equal(rejected.ok, true);
  if (!rejected.ok) {
    return;
  }
  assert.equal(rejected.nextState, 'PENDING');
  assert.equal(rejected.result.changed, false);
  assert.deepEqual(rejected.effectPlan, []);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, rejectedRequest.id))
      .then((rows) => rows.length),
    1,
  );

  const canceledPair = {
    follower: await createProfile(),
    followee: await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED),
  };
  const canceledRequest = await db
    .insert(ProfileFollowRequests)
    .values({
      followerProfileId: canceledPair.follower.id,
      followeeProfileId: canceledPair.followee.id,
    })
    .returning()
    .then(firstOrThrow);
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, canceledPair.followee.instanceId));

  const canceled = await executeProfileFollowPairTransition({
    pair: {
      followerProfileId: canceledPair.follower.id,
      followeeProfileId: canceledPair.followee.id,
    },
    pendingSnapshot: {
      id: canceledRequest.id,
      followerProfileId: canceledRequest.followerProfileId,
      followeeProfileId: canceledRequest.followeeProfileId,
      createdAt: canceledRequest.createdAt.toString(),
    },
    command: {
      kind: 'CANCEL',
      followerProfileId: canceledPair.follower.id,
      followeeProfileId: canceledPair.followee.id,
      expectedRowId: canceledRequest.id,
      origin: 'ACTIVITYPUB',
    },
  });
  assert.equal(canceled.ok, true);
  if (!canceled.ok) {
    return;
  }
  assert.equal(canceled.nextState, 'PENDING');
  assert.equal(canceled.result.changed, false);
  assert.deepEqual(canceled.effectPlan, []);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, canceledRequest.id))
      .then((rows) => rows.length),
    1,
  );
});

test('removal does not reconstruct an effect while the guarded expected Follow row remains', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const follow = await db
    .insert(ProfileFollows)
    .values({
      id: crypto.randomUUID(),
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    })
    .returning()
    .then(firstOrThrow);
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, follower.instanceId));

  const result = await executeProfileFollowRemoval({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
    expectedRowId: follow.id,
    origin: 'ACTIVITYPUB',
    transition: 'INBOUND_UNDO',
    snapshot: {
      id: follow.id,
      followerProfileId: follow.followerProfileId,
      followeeProfileId: follow.followeeProfileId,
      createdAt: follow.createdAt.toString(),
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.changed, false);
  assert.deepEqual(result.effectPlan, []);
  assert.deepEqual(await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, follow.id)), [
    follow,
  ]);
});

test('removal retry reconstructs the deleted Follow effect without deleting a refollow generation', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const firstFollow = await db
    .insert(ProfileFollows)
    .values({
      id: crypto.randomUUID(),
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    })
    .returning()
    .then(firstOrThrow);
  const input = {
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
    expectedRowId: firstFollow.id,
    origin: 'LOCAL' as const,
    transition: 'UNFOLLOW' as const,
    snapshot: {
      id: firstFollow.id,
      followerProfileId: firstFollow.followerProfileId,
      followeeProfileId: firstFollow.followeeProfileId,
      createdAt: firstFollow.createdAt.toString(),
    },
  };

  const removed = await executeProfileFollowRemoval(input);
  assert.equal(removed.ok, true);
  if (!removed.ok) {
    return;
  }
  assert.equal(removed.changed, true);
  assert.equal(removed.profileFollowId, firstFollow.id);

  const secondFollow = await db
    .insert(ProfileFollows)
    .values({
      id: crypto.randomUUID(),
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    })
    .returning()
    .then(firstOrThrow);

  const retry = await executeProfileFollowRemoval(input);
  assert.equal(retry.ok, true);
  if (!retry.ok) {
    return;
  }
  assert.equal(retry.changed, true);
  assert.equal(retry.profileFollowId, null);
  assert.deepEqual(retry.effectPlan, [
    {
      kind: 'DELETE',
      input: {
        createdAt: firstFollow.createdAt.toString(),
        followerProfileId: follower.id,
        followeeProfileId: followee.id,
        id: firstFollow.id,
        origin: 'LOCAL',
        sendActivityPub: false,
        sourceId: firstFollow.id,
        sourceKind: 'FOLLOW',
        transition: 'UNFOLLOW',
      },
    },
  ]);
  assert.deepEqual(
    await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, secondFollow.id)),
    [secondFollow],
  );
});
