import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
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
import { recordInboundFollow, removeInboundFollow } from './inbound-profile-follow';

after(async () => pg.end());

const createPair = async (followPolicy: ProfileFollowPolicy) => {
  const suffix = crypto.randomUUID();
  const [localInstance, remoteInstance] = await db
    .insert(Instances)
    .values([
      {
        domain: `local-${suffix}.example`,
        kind: InstanceKind.LOCAL,
        state: InstanceState.ACTIVE,
      },
      {
        domain: `remote-${suffix}.example`,
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.ACTIVE,
      },
    ])
    .returning();
  const [followee, follower] = await db
    .insert(Profiles)
    .values([
      {
        displayName: 'Local',
        followPolicy,
        handle: `local-${suffix}`,
        instanceId: localInstance!.id,
        normalizedHandle: `local-${suffix}`,
        state: ProfileState.ACTIVE,
      },
      {
        displayName: 'Remote',
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: `remote-${suffix}`,
        instanceId: remoteInstance!.id,
        normalizedHandle: `remote-${suffix}`,
        state: ProfileState.ACTIVE,
      },
    ])
    .returning();
  return { followee: followee!, follower: follower! };
};

const getProfiles = async (followerProfileId: string, followeeProfileId: string) => ({
  followee: await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, followeeProfileId))
    .then(firstOrThrow),
  follower: await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, followerProfileId))
    .then(firstOrThrow),
});

describe('inbound profile follow service', () => {
  test('reuses the current relation and removes it idempotently', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.OPEN);
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    const first = await recordInboundFollow(input);
    const duplicate = await recordInboundFollow(input);

    assert.equal(first, 'ESTABLISHED');
    assert.equal(duplicate, 'ESTABLISHED');
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee: { ...followee, followersCount: 1 },
      follower: { ...follower, followingCount: 1 },
    });
    assert.equal(await removeInboundFollow(input), true);
    assert.equal(await removeInboundFollow(input), false);
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee,
      follower,
    });
  });

  test('creates and removes a pending-only request without changing counts', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.APPROVAL_REQUIRED);
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    const first = await recordInboundFollow(input);
    const duplicate = await recordInboundFollow(input);

    assert.equal(first, 'PENDING');
    assert.equal(duplicate, 'PENDING');
    assert.deepEqual(await getProfiles(follower.id, followee.id), { followee, follower });
    assert.equal(await removeInboundFollow(input), true);
    assert.equal(
      await db
        .select()
        .from(ProfileFollowRequests)
        .where(eq(ProfileFollowRequests.followerProfileId, follower.id))
        .then((rows) => rows.length),
      0,
    );
    assert.deepEqual(await getProfiles(follower.id, followee.id), { followee, follower });
  });

  test('serializes concurrent duplicate Follow and increments counts once', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.OPEN);
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    const results = await Promise.all([recordInboundFollow(input), recordInboundFollow(input)]);

    assert.deepEqual(results, ['ESTABLISHED', 'ESTABLISHED']);
    assert.equal(
      await db
        .select()
        .from(ProfileFollows)
        .where(eq(ProfileFollows.followerProfileId, follower.id))
        .then((rows) => rows.length),
      1,
    );
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee: { ...followee, followersCount: 1 },
      follower: { ...follower, followingCount: 1 },
    });
  });

  test('serializes concurrent duplicate pending Follow without changing counts', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.APPROVAL_REQUIRED);
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    const results = await Promise.all([recordInboundFollow(input), recordInboundFollow(input)]);

    assert.deepEqual(results, ['PENDING', 'PENDING']);
    assert.equal(
      await db
        .select()
        .from(ProfileFollowRequests)
        .where(eq(ProfileFollowRequests.followerProfileId, follower.id))
        .then((rows) => rows.length),
      1,
    );
    assert.deepEqual(await getProfiles(follower.id, followee.id), { followee, follower });
  });

  test('serializes a duplicate Follow after a concurrent Undo', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.OPEN);
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    await recordInboundFollow(input);
    const original = await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.followerProfileId, follower.id))
      .then(firstOrThrow);

    let releaseRelation!: () => void;
    const relationReleased = new Promise<void>((resolve) => {
      releaseRelation = resolve;
    });
    let relationLocked!: () => void;
    const relationIsLocked = new Promise<void>((resolve) => {
      relationLocked = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: ProfileFollows.id })
        .from(ProfileFollows)
        .where(eq(ProfileFollows.id, original.id))
        .for('update', { of: ProfileFollows });
      relationLocked();
      await relationReleased;
    });

    await relationIsLocked;
    const removal = removeInboundFollow({ ...input, expectedRowId: original.id });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const duplicate = recordInboundFollow(input);
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseRelation();

    const [removed, duplicateResult] = await Promise.all([removal, duplicate, blocker]);
    const relations = await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.followerProfileId, follower.id));
    assert.equal(removed, true);
    assert.equal(duplicateResult, 'ESTABLISHED');
    assert.equal(relations.length, 1);
    assert.notEqual(relations[0]!.id, original.id);
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee: { ...followee, followersCount: 1 },
      follower: { ...follower, followingCount: 1 },
    });
  });

  test('does not delete a new exact-row refollow that replaces the captured row', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.OPEN);
    await recordInboundFollow({
      followeeProfileId: followee.id,
      followerProfileId: follower.id,
    });
    const original = await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.id),
          eq(ProfileFollows.followeeProfileId, followee.id),
        ),
      )
      .then(firstOrThrow);

    let releaseReplacement!: () => void;
    const replacementMayCommit = new Promise<void>((resolve) => {
      releaseReplacement = resolve;
    });
    let captured!: () => void;
    const rowCaptured = new Promise<void>((resolve) => {
      captured = resolve;
    });
    const replacement = db.transaction(async (tx) => {
      await tx
        .select()
        .from(ProfileFollows)
        .where(eq(ProfileFollows.id, original.id))
        .for('update', { of: ProfileFollows });
      captured();
      await replacementMayCommit;
      await tx.delete(ProfileFollows).where(eq(ProfileFollows.id, original.id));
      return tx
        .insert(ProfileFollows)
        .values({
          followeeProfileId: followee.id,
          followerProfileId: follower.id,
        })
        .returning()
        .then(firstOrThrow);
    });

    await rowCaptured;
    const removal = removeInboundFollow({
      expectedRowId: original.id,
      followeeProfileId: followee.id,
      followerProfileId: follower.id,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseReplacement();

    const [newRelation, removalResult] = await Promise.all([replacement, removal]);
    assert.equal(removalResult, false);
    assert.notEqual(newRelation.id, original.id);
    assert.deepEqual(
      await db.select().from(ProfileFollows).where(eq(ProfileFollows.id, newRelation.id)),
      [newRelation],
    );
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee: { ...followee, followersCount: 1 },
      follower: { ...follower, followingCount: 1 },
    });
  });

  test('joins a caller transaction and rolls back relation and counts', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.OPEN);

    await assert.rejects(
      db.transaction(async (tx) => {
        await recordInboundFollow(
          {
            followeeProfileId: followee.id,
            followerProfileId: follower.id,
          },
          tx,
        );
        throw new Error('rollback');
      }),
      /rollback/,
    );

    assert.equal(
      await db
        .select()
        .from(ProfileFollows)
        .where(eq(ProfileFollows.followerProfileId, follower.id))
        .then((rows) => rows.length),
      0,
    );
    assert.deepEqual(await getProfiles(follower.id, followee.id), { followee, follower });
  });
});
