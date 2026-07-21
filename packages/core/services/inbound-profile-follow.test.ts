import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { followProfile, removeInboundFollow, unfollowProfile } from './profile-follow';

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

const readNotifications = (sourceId: string) =>
  db.select().from(Notifications).where(eq(Notifications.sourceId, sourceId));

const recordInboundFollow = async (input: {
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
}) =>
  (
    await followProfile({
      ...input,
    })
  ).result.kind;

const removeInboundFollowThroughLifecycle = (input: {
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
}) => unfollowProfile(input);

describe('ActivityPub inbound profile follow lifecycle', () => {
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
    const relation = await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.followerProfileId, follower.id))
      .then(firstOrThrow);
    assert.equal((await readNotifications(relation.id)).length, 1);
    assert.equal((await removeInboundFollowThroughLifecycle(input)).profileFollowId, relation.id);
    assert.deepEqual(await readNotifications(relation.id), []);
    assert.equal((await removeInboundFollowThroughLifecycle(input)).profileFollowId, null);
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
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(eq(Notifications.recipientProfileId, followee.id))
        .then((rows) => rows.length),
      0,
    );
    assert.equal((await removeInboundFollowThroughLifecycle(input)).profileFollowId, null);
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
    const relation = await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.followerProfileId, follower.id))
      .then(firstOrThrow);
    assert.equal((await readNotifications(relation.id)).length, 1);
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

  test('keeps an established inbound Follow when Notification creation fails', async () => {
    const { followee, follower } = await createPair(ProfileFollowPolicy.OPEN);
    await db.execute(
      sql`ALTER TABLE ${Notifications} ADD CONSTRAINT notification_inbound_create_failure CHECK (false) NOT VALID`,
    );

    try {
      assert.equal(
        await recordInboundFollow({
          followeeProfileId: followee.id,
          followerProfileId: follower.id,
        }),
        'ESTABLISHED',
      );
    } finally {
      await db.execute(
        sql`ALTER TABLE ${Notifications} DROP CONSTRAINT notification_inbound_create_failure`,
      );
    }

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
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(eq(Notifications.recipientProfileId, followee.id))
        .then((rows) => rows.length),
      0,
    );
  });
});
