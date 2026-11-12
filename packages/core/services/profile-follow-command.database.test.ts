import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const primaryHost = process.env.PGHOST;
if (!primaryHost) {
  throw new Error('PGHOST must be set by the isolated Core test database');
}
process.env.PGREADHOST = primaryHost;

const {
  db,
  firstOrThrow,
  Instances,
  pg,
  pgRead,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  withPrimaryDatabase,
} = await import('../db/index.ts');
const { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } =
  await import('../enums.ts');
const {
  executeProfileFollowPairTransition,
  hydrateProfileFollowPairTransition,
  loadPendingFollowRequestId,
  verifyProfileFollowRemoval,
} = await import('./profile-follow-command.ts');
const { and, eq, inArray } = await import('drizzle-orm');

if (!pgRead) {
  throw new Error('PGREADHOST must create a read client for the replica snapshot test');
}

const profileIds: string[] = [];
const instanceIds: string[] = [];

const createProfile = async (
  followPolicy: (typeof ProfileFollowPolicy)[keyof typeof ProfileFollowPolicy],
) => {
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

const withStaleReplicaSnapshot = async <T>(operation: () => Promise<T>): Promise<T> => {
  const originalUnsafe = pgRead.unsafe;
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  let releaseSnapshot!: () => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const holdSnapshot = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  const snapshotRun = pgRead
    .begin('isolation level repeatable read read only', async (snapshot) => {
      await snapshot.unsafe('SELECT id FROM profile LIMIT 1');
      pgRead.unsafe = ((...args: Parameters<typeof pgRead.unsafe>) =>
        snapshot.unsafe(...args)) as typeof pgRead.unsafe;
      resolveReady();
      await holdSnapshot;
    })
    .catch((error: unknown) => {
      rejectReady(error);
      throw error;
    });
  void snapshotRun.catch(() => undefined);

  try {
    await ready;
    return await operation();
  } finally {
    pgRead.unsafe = originalUnsafe;
    releaseSnapshot();
    await snapshotRun;
  }
};

after(async () => {
  try {
    await withPrimaryDatabase(async () => {
      if (profileIds.length > 0) {
        await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
      }
      if (instanceIds.length > 0) {
        await db.delete(Instances).where(inArray(Instances.id, instanceIds));
      }
    });
  } finally {
    await Promise.all([pg.end({ timeout: 0 }), pgRead.end({ timeout: 0 })]);
  }
});

test('Follow request identity, removal verification, and hydration read committed rows with a stale replica', async () => {
  const pendingFollower = await createProfile(ProfileFollowPolicy.OPEN);
  const pendingFollowee = await createProfile(ProfileFollowPolicy.APPROVAL_REQUIRED);
  const establishedFollower = await createProfile(ProfileFollowPolicy.OPEN);
  const establishedFollowee = await createProfile(ProfileFollowPolicy.OPEN);

  await withStaleReplicaSnapshot(async () => {
    const pendingPair = {
      followerProfileId: pendingFollower.id,
      followeeProfileId: pendingFollowee.id,
    };
    assert.deepEqual(
      await db
        .select({ id: ProfileFollowRequests.id })
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, pendingPair.followerProfileId),
            eq(ProfileFollowRequests.followeeProfileId, pendingPair.followeeProfileId),
          ),
        ),
      [],
    );

    const pending = await executeProfileFollowPairTransition({
      pair: pendingPair,
      command: { kind: 'FOLLOW', origin: 'LOCAL' },
    });
    if (
      !pending.ok ||
      pending.result.commandKind !== 'FOLLOW' ||
      pending.result.kind !== 'PENDING' ||
      pending.result.profileFollowRequestId === undefined
    ) {
      assert.fail('Expected the Follow command to commit a pending request');
    }

    const pendingRequestId = pending.result.profileFollowRequestId;
    assert.deepEqual(
      await db
        .select({ id: ProfileFollowRequests.id })
        .from(ProfileFollowRequests)
        .where(eq(ProfileFollowRequests.id, pendingRequestId)),
      [],
      'an ordinary read remains on the snapshot taken before the request commit',
    );
    assert.equal(await loadPendingFollowRequestId({ pair: pendingPair }), pendingRequestId);

    const hydrated = await hydrateProfileFollowPairTransition(pending.result);
    assert.equal(hydrated.followerProfile.id, pendingPair.followerProfileId);
    assert.equal(hydrated.followeeProfile.id, pendingPair.followeeProfileId);
    assert.equal(hydrated.profileFollowRequest?.id, pendingRequestId);

    const establishedPair = {
      followerProfileId: establishedFollower.id,
      followeeProfileId: establishedFollowee.id,
    };
    const established = await executeProfileFollowPairTransition({
      pair: establishedPair,
      command: { kind: 'FOLLOW', origin: 'LOCAL' },
    });
    if (
      !established.ok ||
      established.result.commandKind !== 'FOLLOW' ||
      established.result.kind !== 'ESTABLISHED' ||
      established.result.profileFollowId === undefined
    ) {
      assert.fail('Expected the Follow command to commit a relationship');
    }

    const profileFollowId = established.result.profileFollowId;
    assert.deepEqual(
      await db
        .select({ id: ProfileFollows.id })
        .from(ProfileFollows)
        .where(eq(ProfileFollows.id, profileFollowId)),
      [],
      'an ordinary read remains on the snapshot taken before the Follow commit',
    );
    assert.equal(
      await verifyProfileFollowRemoval({ ...establishedPair, expectedRowId: profileFollowId }),
      profileFollowId,
    );
  });
});
