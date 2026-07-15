import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
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
  const actorUri = `https://${remoteInstance!.domain}/users/${follower!.id}`;
  const objectUri = `https://${localInstance!.domain}/ap/actor/${followee!.id}`;

  await db.insert(ActivityPubActors).values([
    {
      profileId: follower!.id,
      type: ActivityPubActorType.PERSON,
      uri: actorUri,
    },
    {
      profileId: followee!.id,
      type: ActivityPubActorType.PERSON,
      uri: objectUri,
    },
  ]);

  return { actorUri, followee: followee!, follower: follower!, objectUri };
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

    assert.equal(first.kind, 'ESTABLISHED');
    assert.equal(first.created, true);
    assert.equal(duplicate.kind, 'ESTABLISHED');
    assert.equal(duplicate.created, false);
    if (duplicate.kind !== 'ESTABLISHED') {
      return;
    }
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee: { ...followee, followersCount: 1 },
      follower: { ...follower, followingCount: 1 },
    });
    assert.deepEqual(await removeInboundFollow(input), {
      deletedId: duplicate.profileFollow.id,
      kind: 'ESTABLISHED',
    });
    assert.equal(await removeInboundFollow(input), null);
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

    assert.equal(first.kind, 'PENDING');
    assert.equal(first.created, true);
    assert.equal(duplicate.kind, 'PENDING');
    assert.equal(duplicate.created, false);
    if (duplicate.kind !== 'PENDING') {
      return;
    }
    assert.deepEqual(await getProfiles(follower.id, followee.id), { followee, follower });
    assert.deepEqual(await removeInboundFollow(input), {
      deletedId: duplicate.profileFollowRequest.id,
      kind: 'PENDING',
    });
    assert.equal(
      await db
        .select()
        .from(ProfileFollowRequests)
        .where(eq(ProfileFollowRequests.id, duplicate.profileFollowRequest.id))
        .then((rows) => rows.length),
      0,
    );
    assert.deepEqual(await getProfiles(follower.id, followee.id), { followee, follower });
  });

  test('serializes concurrent duplicate Follow and increments counts once', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.OPEN);
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    const results = await Promise.all([recordInboundFollow(input), recordInboundFollow(input)]);

    assert.equal(results.filter(({ created }) => created).length, 1);
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee: { ...followee, followersCount: 1 },
      follower: { ...follower, followingCount: 1 },
    });
  });

  test('does not delete a new exact-row refollow that replaces the captured row', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.OPEN);
    const original = await recordInboundFollow({
      followeeProfileId: followee.id,
      followerProfileId: follower.id,
    });
    assert.equal(original.kind, 'ESTABLISHED');

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
        .where(eq(ProfileFollows.id, original.profileFollow.id))
        .for('update', { of: ProfileFollows });
      captured();
      await replacementMayCommit;
      await tx.delete(ProfileFollows).where(eq(ProfileFollows.id, original.profileFollow.id));
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
      expectedRowId: original.profileFollow.id,
      followeeProfileId: followee.id,
      followerProfileId: follower.id,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseReplacement();

    const [newRelation, removalResult] = await Promise.all([replacement, removal]);
    assert.equal(removalResult, null);
    assert.notEqual(newRelation.id, original.profileFollow.id);
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
