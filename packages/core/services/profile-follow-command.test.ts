import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
  verifyProfileFollowRemoval,
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

const readUuidVersion = async (id: string) => {
  const [row] = await db.execute<{ version: number }>(sql`
    SELECT uuid_extract_version(${id}::uuid)::int AS version
  `);
  return row?.version;
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

test('open Follow uses the PostgreSQL-generated row ID and keeps duplicate retry effect-free', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const input: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  };

  const first = await executeProfileFollowPairTransition(input);
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  assert.equal(first.result.commandKind, 'FOLLOW');
  assert.equal(first.result.created, true);
  assert.ok(first.result.profileFollowId);
  const profileFollow = await db
    .select()
    .from(ProfileFollows)
    .where(eq(ProfileFollows.id, first.result.profileFollowId))
    .then(firstOrThrow);
  assert.equal(profileFollow.id, first.result.profileFollowId);
  assert.equal(await readUuidVersion(profileFollow.id), 7);
  assert.deepEqual(first.effectPlan, [
    {
      kind: 'CREATE',
      input: {
        sendActivityPub: false,
        sourceId: profileFollow.id,
        sourceKind: 'FOLLOW',
      },
    },
  ]);

  const hydrated = await hydrateProfileFollowPairTransition(first.result);
  assert.equal(hydrated.profileFollow?.id, profileFollow.id);
  assert.equal(hydrated.followerProfile.id, follower.id);
  assert.equal(hydrated.followeeProfile.id, followee.id);

  const duplicate = await executeProfileFollowPairTransition(input);
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) {
    return;
  }
  assert.equal(duplicate.result.commandKind, 'FOLLOW');
  assert.equal(duplicate.result.created, false);
  assert.equal(duplicate.result.profileFollowId, profileFollow.id);
  assert.deepEqual(duplicate.effectPlan, []);
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

test('local Follow captures remote delivery eligibility without row snapshots', async () => {
  const follower = await createProfile();
  const followee = await createRemoteProfile(InstanceState.ACTIVE);
  const followed = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  assert.equal(followed.ok, true);
  if (!followed.ok) {
    return;
  }
  assert.equal(followed.result.commandKind, 'FOLLOW');
  assert.ok(followed.result.profileFollowId);
  const profileFollow = await db
    .select()
    .from(ProfileFollows)
    .where(eq(ProfileFollows.id, followed.result.profileFollowId))
    .then(firstOrThrow);
  assert.deepEqual(followed.effectPlan, [
    {
      kind: 'CREATE',
      input: { sendActivityPub: true, sourceId: profileFollow.id, sourceKind: 'FOLLOW' },
    },
  ]);
});

test('approval-required Follow uses the PostgreSQL-generated request ID and deduplicates effects', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const input: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  };

  const pending = await executeProfileFollowPairTransition(input);
  assert.equal(pending.ok, true);
  if (!pending.ok) {
    return;
  }
  assert.equal(pending.nextState, 'PENDING');
  assert.equal(pending.result.commandKind, 'FOLLOW');
  assert.ok(pending.result.profileFollowRequestId);
  const profileFollowRequest = await db
    .select()
    .from(ProfileFollowRequests)
    .where(eq(ProfileFollowRequests.id, pending.result.profileFollowRequestId))
    .then(firstOrThrow);
  assert.equal(pending.pendingRequestId, profileFollowRequest.id);
  assert.equal(await readUuidVersion(profileFollowRequest.id), 7);
  assert.deepEqual(pending.effectPlan, [
    {
      kind: 'CREATE',
      input: {
        sendActivityPub: false,
        sourceId: profileFollowRequest.id,
        sourceKind: 'FOLLOW_REQUEST',
      },
    },
  ]);
  assert.equal(
    await loadPendingFollowRequestId({ pair: input.pair, expectedRowId: profileFollowRequest.id }),
    profileFollowRequest.id,
  );

  const duplicate = await executeProfileFollowPairTransition(input);
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) {
    if (duplicate.result.commandKind !== 'FOLLOW') {
      return;
    }
    assert.equal(duplicate.result.created, false);
    assert.equal(duplicate.result.profileFollowRequestId, profileFollowRequest.id);
    assert.equal(duplicate.pendingRequestId, profileFollowRequest.id);
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
  const promoted = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  assert.equal(promoted.ok, true);
  if (!promoted.ok) {
    return;
  }
  if (promoted.result.commandKind !== 'FOLLOW') {
    return;
  }
  assert.ok(promoted.result.profileFollowId);
  const profileFollow = await db
    .select()
    .from(ProfileFollows)
    .where(eq(ProfileFollows.id, promoted.result.profileFollowId))
    .then(firstOrThrow);
  assert.equal(promoted.result.profileFollowId, profileFollow.id);
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
      input: { sendActivityPub: false, sourceId: profileFollow.id, sourceKind: 'FOLLOW' },
    },
  ]);
});

test('terminal request removal reconstructs a lost commit from pendingRequestId', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const created = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  assert.equal(created.result.commandKind, 'FOLLOW');
  assert.equal(created.result.kind, 'PENDING');
  assert.ok(created.result.profileFollowRequestId);
  const requestId = created.result.profileFollowRequestId;

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
  const pending = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  assert.equal(pending.ok, true);
  if (!pending.ok) {
    return;
  }
  assert.equal(pending.result.commandKind, 'FOLLOW');
  assert.equal(pending.result.kind, 'PENDING');
  assert.ok(pending.result.profileFollowRequestId);
  const requestId = pending.result.profileFollowRequestId;

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
  const requestRows = await db
    .select()
    .from(ProfileFollowRequests)
    .where(eq(ProfileFollowRequests.id, requestId));
  assert.equal(requestRows.length, 1);
  assert.equal(requestRows[0]?.id, requestId);
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
    0,
  );
});

test('Approve completion-loss retry converges to the existing Follow without duplicate effects', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const pending = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  assert.equal(pending.ok, true);
  if (!pending.ok) {
    return;
  }
  assert.equal(pending.result.kind, 'PENDING');
  assert.ok(pending.result.profileFollowRequestId);
  const requestId = pending.result.profileFollowRequestId;
  const input: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    pendingRequestId: requestId,
    command: {
      kind: 'APPROVE',
      actorProfileId: followee.id,
      expectedRowId: requestId,
      origin: 'LOCAL',
    },
  };

  const approved = await executeProfileFollowPairTransition(input);
  assert.equal(approved.ok, true);
  if (!approved.ok) {
    return;
  }
  assert.equal(approved.nextState, 'ESTABLISHED');
  assert.equal(approved.result.kind, 'ACCEPTED');
  assert.ok(approved.result.profileFollowId);
  const profileFollow = await db
    .select()
    .from(ProfileFollows)
    .where(eq(ProfileFollows.id, approved.result.profileFollowId))
    .then(firstOrThrow);
  assert.deepEqual(approved.effectPlan, [
    {
      kind: 'DELETE',
      input: {
        followeeProfileId: followee.id,
        followerProfileId: follower.id,
        sourceId: requestId,
        sourceKind: 'FOLLOW_REQUEST',
      },
    },
    {
      kind: 'CREATE',
      input: { sourceId: profileFollow.id, sourceKind: 'FOLLOW' },
    },
  ]);

  const retry = await executeProfileFollowPairTransition(input);
  assert.equal(retry.ok, true);
  if (!retry.ok) {
    return;
  }
  assert.equal(retry.nextState, 'ESTABLISHED');
  assert.equal(retry.result.commandKind, 'APPROVE');
  assert.equal(retry.result.kind, 'ACCEPTED');
  assert.equal(retry.result.profileFollowId, profileFollow.id);
  assert.deepEqual(retry.effectPlan, []);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, requestId))
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

test('Accept completion-loss retry converges to the existing Follow without duplicate effects', async () => {
  const follower = await createProfile();
  const followee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const pending = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  assert.equal(pending.ok, true);
  if (!pending.ok) {
    return;
  }
  assert.equal(pending.result.kind, 'PENDING');
  assert.ok(pending.result.profileFollowRequestId);
  const requestId = pending.result.profileFollowRequestId;
  const input: ProfileFollowPairTransitionInput = {
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    pendingRequestId: requestId,
    command: {
      kind: 'ACCEPT',
      expectedRowId: requestId,
      origin: 'ACTIVITYPUB',
    },
  };

  const accepted = await executeProfileFollowPairTransition(input);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) {
    return;
  }
  assert.equal(accepted.nextState, 'ESTABLISHED');
  assert.equal(accepted.result.kind, 'ACCEPTED');
  assert.ok(accepted.result.profileFollowId);
  const profileFollow = await db
    .select()
    .from(ProfileFollows)
    .where(eq(ProfileFollows.id, accepted.result.profileFollowId))
    .then(firstOrThrow);
  assert.deepEqual(accepted.effectPlan, [
    {
      kind: 'DELETE',
      input: {
        followeeProfileId: followee.id,
        followerProfileId: follower.id,
        sourceId: requestId,
        sourceKind: 'FOLLOW_REQUEST',
      },
    },
    {
      kind: 'CREATE',
      input: { sourceId: profileFollow.id, sourceKind: 'FOLLOW' },
    },
  ]);

  const retry = await executeProfileFollowPairTransition(input);
  assert.equal(retry.ok, true);
  if (!retry.ok) {
    return;
  }
  assert.equal(retry.nextState, 'ESTABLISHED');
  assert.equal(retry.result.commandKind, 'ACCEPT');
  assert.equal(retry.result.kind, 'ACCEPTED');
  assert.equal(retry.result.profileFollowId, profileFollow.id);
  assert.deepEqual(retry.effectPlan, []);
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, requestId))
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

  assert.equal(await verifyProfileFollowRemoval(input), firstFollow.id);

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

test('removal verification requires the expected Follow ID and directed pair', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const otherFollowee = await createProfile();
  const follow = await db
    .insert(ProfileFollows)
    .values({
      id: crypto.randomUUID(),
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    })
    .returning()
    .then(firstOrThrow);

  assert.equal(
    await verifyProfileFollowRemoval({
      expectedRowId: follow.id,
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
    follow.id,
  );
  assert.equal(
    await verifyProfileFollowRemoval({
      expectedRowId: follow.id,
      followerProfileId: follower.id,
      followeeProfileId: otherFollowee.id,
    }),
    undefined,
  );
  assert.equal(
    await verifyProfileFollowRemoval({
      expectedRowId: crypto.randomUUID(),
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
    undefined,
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

test('hydration does not carry a deleted row snapshot across the Temporal boundary', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const committed = await executeProfileFollowPairTransition({
    pair: { followerProfileId: follower.id, followeeProfileId: followee.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  assert.equal(committed.ok, true);
  if (!committed.ok) {
    return;
  }
  assert.equal(committed.result.kind, 'ESTABLISHED');
  assert.ok(committed.result.profileFollowId);
  const profileFollowId = committed.result.profileFollowId;
  await db.delete(ProfileFollows).where(eq(ProfileFollows.id, profileFollowId));
  const hydrated = await hydrateProfileFollowPairTransition(committed.result);
  assert.equal(hydrated.profileFollow, undefined);
  assert.equal(hydrated.followerProfile.id, follower.id);
});
