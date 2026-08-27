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
  loadPendingFollowRequestId,
} from './profile-follow-command';
import type {
  ProfileFollowPairTransitionInput,
  ProfileFollowRemovalInput,
} from './profile-follow-command';

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

test('open Follow uses the candidate row ID and retries with a minimal effect', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const candidateRowId = crypto.randomUUID();
  const input: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
    candidateRowId,
  };

  const first = await executeProfileFollowPairTransition(input);
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  assert.equal(first.result.commandKind, 'FOLLOW');
  assert.equal(first.result.created, true);
  assert.equal(first.result.profileFollowId, candidateRowId);
  assert.deepEqual(first.effectPlan, [
    {
      kind: 'CREATE',
      input: {
        sendActivityPub: false,
        sourceId: candidateRowId,
        sourceKind: 'FOLLOW',
      },
    },
  ]);

  const hydrated = await hydrateProfileFollowPairTransition(first.result);
  assert.equal(hydrated.profileFollow?.id, candidateRowId);
  assert.equal(hydrated.followerProfile.id, follower.id);
  assert.equal(hydrated.followeeProfile.id, followee.id);
  assert.deepEqual(await executeProfileFollowPairTransition(input), first);
});

test('local Follow captures remote delivery eligibility without row snapshots', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile(InstanceState.ACTIVE);
  const profileFollowId = crypto.randomUUID();
  const followed = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
    candidateRowId: profileFollowId,
  });
  assert.equal(followed.ok, true);
  if (!followed.ok) {
    return;
  }
  assert.deepEqual(followed.effectPlan, [
    {
      kind: 'CREATE',
      input: { sendActivityPub: true, sourceId: profileFollowId, sourceKind: 'FOLLOW' },
    },
  ]);
});

test('approval-required Follow carries only the pending request ID', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const candidateRowId = crypto.randomUUID();
  const input: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
    candidateRowId,
  };

  const pending = await executeProfileFollowPairTransition(input);
  assert.equal(pending.ok, true);
  if (!pending.ok) {
    return;
  }
  assert.equal(pending.nextState, 'PENDING');
  assert.equal(pending.pendingRequestId, candidateRowId);
  assert.deepEqual(pending.effectPlan, [
    {
      kind: 'CREATE',
      input: {
        sendActivityPub: false,
        sourceId: candidateRowId,
        sourceKind: 'FOLLOW_REQUEST',
      },
    },
  ]);
  assert.equal(
    await loadPendingFollowRequestId({ pair: input.pair, expectedRowId: candidateRowId }),
    candidateRowId,
  );

  const duplicate = await executeProfileFollowPairTransition({
    ...input,
    candidateRowId: crypto.randomUUID(),
  });
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) {
    if (duplicate.result.commandKind !== 'FOLLOW') {
      return;
    }
    assert.equal(duplicate.result.created, false);
    assert.equal(duplicate.pendingRequestId, candidateRowId);
    assert.deepEqual(duplicate.effectPlan, []);
  }
});

test('promoting an existing request deletes it by ID and creates the Follow effect', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);
  const followId = crypto.randomUUID();
  const promoted = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
    candidateRowId: followId,
  });
  assert.equal(promoted.ok, true);
  if (!promoted.ok) {
    return;
  }
  if (promoted.result.commandKind !== 'FOLLOW') {
    return;
  }
  assert.equal(promoted.result.profileFollowId, followId);
  assert.deepEqual(promoted.effectPlan, [
    {
      kind: 'DELETE',
      input: {
        followeeProfileId: followee.id,
        followerProfileId: follower.id,
        sourceId: request.id,
        sourceKind: 'FOLLOW_REQUEST',
      },
    },
    {
      kind: 'CREATE',
      input: { sendActivityPub: false, sourceId: followId, sourceKind: 'FOLLOW' },
    },
  ]);
});

test('terminal request removal reconstructs a lost commit from pendingRequestId', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const requestId = crypto.randomUUID();
  const created = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
    candidateRowId: requestId,
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }

  const input: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    pendingRequestId: requestId,
    command: {
      kind: 'REJECT',
      expectedRowId: requestId,
      origin: 'LOCAL',
      actorProfileId: followee.id,
    },
  };
  const rejected = await executeProfileFollowPairTransition(input);
  assert.equal(rejected.ok, true);
  if (!rejected.ok) {
    return;
  }
  if (rejected.result.commandKind !== 'REJECT' && rejected.result.commandKind !== 'CANCEL') {
    return;
  }
  assert.equal(rejected.result.changed, true);
  assert.deepEqual(rejected.effectPlan, [
    {
      kind: 'DELETE',
      input: {
        followeeProfileId: followee.id,
        followerProfileId: follower.id,
        sourceId: requestId,
        sourceKind: 'FOLLOW_REQUEST',
      },
    },
  ]);

  const retry = await executeProfileFollowPairTransition(input);
  assert.deepEqual(retry, rejected);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, requestId))
      .then((rows) => rows.length),
    0,
  );
});

test('stale terminal request ID does not remove a newer generation', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const current = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);
  const stale = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'CANCEL',
      expectedRowId: crypto.randomUUID(),
      origin: 'LOCAL',
      actorProfileId: follower.id,
    },
  });
  assert.equal(stale.ok, true);
  if (!stale.ok) {
    return;
  }
  if (stale.result.commandKind !== 'REJECT' && stale.result.commandKind !== 'CANCEL') {
    return;
  }
  assert.equal(stale.result.changed, false);
  assert.deepEqual(stale.effectPlan, []);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, current.id))
      .then((rows) => rows.length),
    1,
  );
});

test('unavailable inbound Accept stays pending without a Follow effect', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const requestId = crypto.randomUUID();
  const pending = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
    candidateRowId: requestId,
  });
  assert.equal(pending.ok, true);
  if (!pending.ok) {
    return;
  }

  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, followee.instanceId));
  const accepted = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    pendingRequestId: requestId,
    command: {
      kind: 'ACCEPT',
      expectedRowId: requestId,
      origin: 'ACTIVITYPUB',
    },
    followCandidateId: crypto.randomUUID(),
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) {
    return;
  }
  if (accepted.result.commandKind !== 'APPROVE' && accepted.result.commandKind !== 'ACCEPT') {
    return;
  }
  assert.equal(accepted.nextState, 'PENDING');
  assert.equal(accepted.result.kind, 'NOOP');
  assert.deepEqual(accepted.effectPlan, []);
});

test('removal retry uses the expected Follow ID and preserves a refollow generation', async () => {
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
  };

  const removed = await executeProfileFollowRemoval(input);
  assert.equal(removed.ok, true);
  if (!removed.ok) {
    return;
  }
  assert.equal(removed.changed, true);
  assert.equal(removed.profileFollowId, firstFollow.id);
  assert.deepEqual(removed.effectPlan, [
    {
      kind: 'DELETE',
      input: {
        followeeProfileId: followee.id,
        followerProfileId: follower.id,
        sendActivityPub: false,
        sourceId: firstFollow.id,
        sourceKind: 'FOLLOW',
      },
    },
  ]);

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
  assert.deepEqual(retry.effectPlan, removed.effectPlan);
  assert.deepEqual(
    await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, secondFollow.id)),
    [secondFollow],
  );
});

test('guarded removal does not reconstruct an effect while the expected row remains', async () => {
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

test('removal rejects malformed input without deleting the current Follow', async () => {
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
  const validInput: ProfileFollowRemovalInput = {
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
    expectedRowId: follow.id,
    origin: 'LOCAL',
  };

  for (const input of [
    { ...validInput, expectedRowId: undefined },
    { ...validInput, followerProfileId: undefined },
    { ...validInput, followeeProfileId: null },
    { ...validInput, origin: 'UNKNOWN' },
    null,
  ] as unknown[]) {
    const result = await executeProfileFollowRemoval(input as ProfileFollowRemovalInput);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION');
    }
  }

  assert.deepEqual(await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, follow.id)), [
    follow,
  ]);
});

test('hydration does not carry a deleted row snapshot across the Temporal boundary', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollowId = crypto.randomUUID();
  const committed = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
    candidateRowId: profileFollowId,
  });
  assert.equal(committed.ok, true);
  if (!committed.ok) {
    return;
  }
  await db.delete(ProfileFollows).where(eq(ProfileFollows.id, profileFollowId));
  const hydrated = await hydrateProfileFollowPairTransition(committed.result);
  assert.equal(hydrated.profileFollow, undefined);
  assert.equal(hydrated.followerProfile.id, follower.id);
});
