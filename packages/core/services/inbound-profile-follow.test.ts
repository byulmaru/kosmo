import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
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

const t1 = Temporal.Instant.from('2026-07-15T01:00:00Z');
const t2 = Temporal.Instant.from('2026-07-15T02:00:00Z');
const t3 = Temporal.Instant.from('2026-07-15T03:00:00Z');
const t4 = Temporal.Instant.from('2026-07-15T04:00:00Z');

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

const correlation = (
  actorUri: string,
  objectUri: string,
  activityId: string,
  generation: Temporal.Instant,
) => ({ activityId, actorUri, generation, objectUri });

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
  test('keeps first metadata, advances generation, and rejects delayed Undo', async () => {
    const { actorUri, followee, follower, objectUri } = await createPair(ProfileFollowPolicy.OPEN);
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    const first = await recordInboundFollow({
      ...input,
      correlation: correlation(actorUri, objectUri, 'https://remote.example/follow/1', t1),
    });
    const duplicate = await recordInboundFollow({
      ...input,
      correlation: correlation(actorUri, objectUri, 'https://remote.example/follow/3', t3),
    });

    assert.equal(first.kind, 'ESTABLISHED');
    assert.equal(first.created, true);
    assert.equal(duplicate.kind, 'ESTABLISHED');
    assert.equal(duplicate.created, false);
    if (duplicate.kind !== 'ESTABLISHED') {
      return;
    }
    assert.equal(
      duplicate.profileFollow.inboundFollowActivityId,
      'https://remote.example/follow/1',
    );
    assert.equal(duplicate.profileFollow.inboundFollowGeneration?.equals(t3), true);
    assert.equal(
      await removeInboundFollow({
        ...input,
        actorUri,
        expectedGeneration: t2,
        objectUri,
      }),
      null,
    );

    const preserved = await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, follower.id),
          eq(ProfileFollows.followeeProfileId, followee.id),
        ),
      )
      .then(firstOrThrow);
    assert.equal(preserved.id, duplicate.profileFollow.id);
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee: { ...followee, followersCount: 1 },
      follower: { ...follower, followingCount: 1 },
    });

    assert.deepEqual(
      await removeInboundFollow({
        ...input,
        actorUri,
        expectedGeneration: t4,
        objectUri,
      }),
      { deletedId: preserved.id, kind: 'ESTABLISHED' },
    );
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee,
      follower,
    });
  });

  test('creates and removes a pending-only request without changing counts', async () => {
    const { actorUri, followee, follower, objectUri } = await createPair(
      ProfileFollowPolicy.APPROVAL_REQUIRED,
    );
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    const first = await recordInboundFollow({
      ...input,
      correlation: correlation(actorUri, objectUri, 'https://remote.example/follow/1', t1),
    });
    const duplicate = await recordInboundFollow({
      ...input,
      correlation: correlation(actorUri, objectUri, 'https://remote.example/follow/3', t3),
    });

    assert.equal(first.kind, 'PENDING');
    assert.equal(first.created, true);
    assert.equal(duplicate.kind, 'PENDING');
    assert.equal(duplicate.created, false);
    if (duplicate.kind !== 'PENDING') {
      return;
    }
    assert.equal(
      duplicate.profileFollowRequest.inboundFollowActivityId,
      'https://remote.example/follow/1',
    );
    assert.equal(duplicate.profileFollowRequest.inboundFollowGeneration?.equals(t3), true);
    assert.deepEqual(await getProfiles(follower.id, followee.id), { followee, follower });
    assert.deepEqual(
      await removeInboundFollow({
        ...input,
        actorUri,
        expectedGeneration: t4,
        objectUri,
      }),
      { deletedId: duplicate.profileFollowRequest.id, kind: 'PENDING' },
    );
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
    const { actorUri, followee, follower, objectUri } = await createPair(ProfileFollowPolicy.OPEN);
    const input = { followeeProfileId: followee.id, followerProfileId: follower.id };
    const results = await Promise.all([
      recordInboundFollow({
        ...input,
        correlation: correlation(actorUri, objectUri, 'https://remote.example/follow/1', t1),
      }),
      recordInboundFollow({
        ...input,
        correlation: correlation(actorUri, objectUri, 'https://remote.example/follow/3', t3),
      }),
    ]);

    assert.equal(results.filter(({ created }) => created).length, 1);
    assert.deepEqual(await getProfiles(follower.id, followee.id), {
      followee: { ...followee, followersCount: 1 },
      follower: { ...follower, followingCount: 1 },
    });
  });

  test('does not delete a new exact-row refollow that replaces the captured row', async () => {
    const { actorUri, followee, follower, objectUri } = await createPair(ProfileFollowPolicy.OPEN);
    const original = await recordInboundFollow({
      correlation: correlation(actorUri, objectUri, 'https://remote.example/follow/1', t1),
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
          inboundFollowActivityId: 'https://remote.example/follow/3',
          inboundFollowActorUri: actorUri,
          inboundFollowGeneration: t3,
          inboundFollowObjectUri: objectUri,
          followeeProfileId: followee.id,
          followerProfileId: follower.id,
        })
        .returning()
        .then(firstOrThrow);
    });

    await rowCaptured;
    const removal = removeInboundFollow({
      actorUri,
      expectedGeneration: t4,
      followeeProfileId: followee.id,
      followerProfileId: follower.id,
      objectUri,
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
    const { actorUri, followee, follower, objectUri } = await createPair(ProfileFollowPolicy.OPEN);

    await assert.rejects(
      db.transaction(async (tx) => {
        await recordInboundFollow(
          {
            correlation: correlation(actorUri, objectUri, 'https://remote.example/follow/1', t1),
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
