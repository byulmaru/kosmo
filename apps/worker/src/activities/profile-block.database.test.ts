import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import {
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  ProfileBlockActivities,
  ProfileBlocks,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { recordProfileBlockProtocolTombstone } from '@kosmo/core/services';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  executeProfileBlockTransitionActivity,
  executeProfileUnblockTransitionActivity,
} from './profile-block';

const profileIds = new Set<string>();
const instanceIds = new Set<string>();

const createProfile = async ({
  instanceKind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
}: {
  readonly instanceKind?: InstanceKind;
  readonly instanceState?: InstanceState;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.add(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.add(profile.id);
  return { instance, profile };
};

const createFollow = async ({
  followerProfileId,
  followeeProfileId,
}: {
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
}) =>
  db
    .insert(ProfileFollows)
    .values({ followerProfileId, followeeProfileId })
    .returning()
    .then(firstOrThrow);

const followPairRows = (firstProfileId: string, secondProfileId: string) =>
  or(
    and(
      eq(ProfileFollows.followerProfileId, firstProfileId),
      eq(ProfileFollows.followeeProfileId, secondProfileId),
    ),
    and(
      eq(ProfileFollows.followerProfileId, secondProfileId),
      eq(ProfileFollows.followeeProfileId, firstProfileId),
    ),
  );

const requestPairRows = (firstProfileId: string, secondProfileId: string) =>
  or(
    and(
      eq(ProfileFollowRequests.followerProfileId, firstProfileId),
      eq(ProfileFollowRequests.followeeProfileId, secondProfileId),
    ),
    and(
      eq(ProfileFollowRequests.followerProfileId, secondProfileId),
      eq(ProfileFollowRequests.followeeProfileId, firstProfileId),
    ),
  );

const currentProfileBlockId = async (ownerProfileId: string, targetProfileId: string) =>
  db
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(
      and(
        eq(ProfileBlocks.ownerProfileId, ownerProfileId),
        eq(ProfileBlocks.targetProfileId, targetProfileId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]?.id ?? null);

afterEach(async () => {
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
  }
  profileIds.clear();
  instanceIds.clear();
});

after(async () => {
  await pg.end();
});

test('Block success removes current bidirectional Follow/Request and direct notifications atomically', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const requestOwnerToTargetId = '00000000-0000-4000-8000-000000000401';
  const requestTargetToOwnerId = '00000000-0000-4000-8000-000000000402';

  const followOwnerToTargetId = (
    await createFollow({ followerProfileId: owner.id, followeeProfileId: target.id })
  ).id;
  const followTargetToOwnerId = (
    await createFollow({ followerProfileId: target.id, followeeProfileId: owner.id })
  ).id;
  await db
    .update(Profiles)
    .set({ followersCount: 1, followingCount: 1 })
    .where(inArray(Profiles.id, [owner.id, target.id]));
  await db.insert(ProfileFollowRequests).values([
    {
      id: requestOwnerToTargetId,
      followerProfileId: owner.id,
      followeeProfileId: target.id,
    },
    {
      id: requestTargetToOwnerId,
      followerProfileId: target.id,
      followeeProfileId: owner.id,
    },
  ]);
  const unrelatedNotificationSourceId = '00000000-0000-4000-8000-000000000403';
  await db.insert(Notifications).values([
    {
      kind: NotificationKind.FOLLOW,
      recipientProfileId: target.id,
      sourceId: followOwnerToTargetId,
    },
    {
      kind: NotificationKind.FOLLOW,
      recipientProfileId: owner.id,
      sourceId: followTargetToOwnerId,
    },
    {
      kind: NotificationKind.FOLLOW_REQUEST,
      recipientProfileId: target.id,
      sourceId: requestOwnerToTargetId,
    },
    {
      kind: NotificationKind.FOLLOW_REQUEST,
      recipientProfileId: owner.id,
      sourceId: requestTargetToOwnerId,
    },
    {
      kind: NotificationKind.REACTION,
      recipientProfileId: owner.id,
      sourceId: unrelatedNotificationSourceId,
    },
  ]);

  const execution = await executeProfileBlockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL',
  });

  assert.equal(execution.ok, true);
  if (!execution.ok) {
    return;
  }
  assert.equal(execution.result.created, true);
  assert.equal(execution.result.ownerProfileId, owner.id);
  assert.equal(execution.result.targetProfileId, target.id);
  assert.deepEqual(
    new Set(execution.unfollowInputs),
    new Set([
      {
        sourceId: followOwnerToTargetId,
        followerProfileId: owner.id,
        followeeProfileId: target.id,
      },
      {
        sourceId: requestOwnerToTargetId,
        followerProfileId: owner.id,
        followeeProfileId: target.id,
      },
    ]),
  );

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(followPairRows(owner.id, target.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(requestPairRows(owner.id, target.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(Notifications)
      .where(
        and(
          inArray(Notifications.kind, [NotificationKind.FOLLOW, NotificationKind.FOLLOW_REQUEST]),
          inArray(Notifications.sourceId, [
            followOwnerToTargetId,
            followTargetToOwnerId,
            requestOwnerToTargetId,
            requestTargetToOwnerId,
          ]),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(Notifications)
      .where(
        and(
          eq(Notifications.kind, NotificationKind.REACTION),
          eq(Notifications.sourceId, unrelatedNotificationSourceId),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
  assert.equal(await currentProfileBlockId(owner.id, target.id), execution.result.profileBlockId);
  assert.deepEqual(
    await db
      .select({ followersCount: Profiles.followersCount, followingCount: Profiles.followingCount })
      .from(Profiles)
      .where(eq(Profiles.id, owner.id))
      .then(firstOrThrow),
    { followersCount: 0, followingCount: 0 },
  );
  assert.deepEqual(
    await db
      .select({ followersCount: Profiles.followersCount, followingCount: Profiles.followingCount })
      .from(Profiles)
      .where(eq(Profiles.id, target.id))
      .then(firstOrThrow),
    { followersCount: 0, followingCount: 0 },
  );
});

test('Block duplicate observes the existing row without cleaning later sources', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile();
  const firstExecution = await executeProfileBlockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL',
  });
  assert.equal(firstExecution.ok, true);
  if (!firstExecution.ok) {
    return;
  }

  const lateFollowId = (
    await createFollow({ followerProfileId: owner.id, followeeProfileId: target.id })
  ).id;
  const lateRequestId = '00000000-0000-4000-8000-000000000503';
  await db.insert(ProfileFollowRequests).values({
    id: lateRequestId,
    followerProfileId: target.id,
    followeeProfileId: owner.id,
  });
  await db.insert(Notifications).values([
    {
      kind: NotificationKind.FOLLOW,
      recipientProfileId: target.id,
      sourceId: lateFollowId,
    },
    {
      kind: NotificationKind.FOLLOW_REQUEST,
      recipientProfileId: owner.id,
      sourceId: lateRequestId,
    },
  ]);

  const duplicate = await executeProfileBlockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL',
  });

  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) {
    return;
  }
  assert.deepEqual(duplicate.result, {
    created: false,
    profileBlockId: firstExecution.result.profileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  assert.deepEqual(duplicate.unfollowInputs, []);
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, lateFollowId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, lateRequestId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(Notifications)
      .where(inArray(Notifications.sourceId, [lateFollowId, lateRequestId]))
      .then((rows) => rows.length),
    2,
  );
});

test('Unblock deletes only the exact Profile Block relation and leaves Follow cleanup untouched', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile();
  const profileBlockId = '00000000-0000-4000-8000-000000000601';
  const replacementProfileBlockId = '00000000-0000-4000-8000-000000000602';
  const requestId = '00000000-0000-4000-8000-000000000603';

  await db.insert(ProfileBlocks).values({
    id: profileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  const followId = (
    await createFollow({ followerProfileId: owner.id, followeeProfileId: target.id })
  ).id;
  await db.insert(ProfileFollowRequests).values({
    id: requestId,
    followerProfileId: target.id,
    followeeProfileId: owner.id,
  });
  await db.insert(Notifications).values([
    { kind: NotificationKind.FOLLOW, recipientProfileId: target.id, sourceId: followId },
    { kind: NotificationKind.FOLLOW_REQUEST, recipientProfileId: owner.id, sourceId: requestId },
  ]);

  const unblock = await executeProfileUnblockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: profileBlockId,
  });
  assert.deepEqual(unblock, {
    ok: true,
    result: {
      removed: true,
      profileBlockId,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
    },
  });
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, followId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, requestId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(Notifications)
      .where(inArray(Notifications.sourceId, [followId, requestId]))
      .then((rows) => rows.length),
    2,
  );

  await db.insert(ProfileBlocks).values({
    id: replacementProfileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  const stale = await executeProfileUnblockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: profileBlockId,
  });
  assert.deepEqual(stale, {
    ok: true,
    result: {
      removed: false,
      profileBlockId: null,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
    },
  });
  assert.equal(await currentProfileBlockId(owner.id, target.id), replacementProfileBlockId);

  const final = await executeProfileUnblockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: replacementProfileBlockId,
  });
  assert.equal(final.ok, true);
  assert.equal(await currentProfileBlockId(owner.id, target.id), null);
});

test('Block rejects self-blocking in the service and the database check', async () => {
  const { profile } = await createProfile();

  const execution = await executeProfileBlockTransitionActivity({
    ownerProfileId: profile.id,
    targetProfileId: profile.id,
    origin: 'LOCAL',
  });
  assert.deepEqual(execution, {
    ok: false,
    error: {
      code: 'CONFLICT',
      message: 'Profile cannot block itself',
    },
  });

  await assert.rejects(
    db.insert(ProfileBlocks).values({
      ownerProfileId: profile.id,
      targetProfileId: profile.id,
    }),
  );
});

test('inbound duplicate Block keeps one active original and Undo closes its exact relation', async () => {
  const { profile: owner } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const { profile: target } = await createProfile();
  const protocolActivity = (activityUri: string) => ({
    activityUri,
    actorUri: `https://remote.example/users/${owner.id}`,
    objectUri: `https://local.example/ap/actor/${target.id}`,
    origin: 'INBOUND' as const,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  const firstActivity = protocolActivity(
    `https://remote.example/activities/${crypto.randomUUID()}`,
  );
  const secondActivity = protocolActivity(
    `https://remote.example/activities/${crypto.randomUUID()}`,
  );
  const block = (protocol: ReturnType<typeof protocolActivity>) =>
    executeProfileBlockTransitionActivity({
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      origin: 'ACTIVITYPUB',
      protocolActivity: protocol,
    });

  const first = await block(firstActivity);
  const second = await block(secondActivity);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) {
    return;
  }
  assert.equal(first.result.created, true);
  assert.equal(second.result.created, false);
  assert.equal(second.result.profileBlockId, first.result.profileBlockId);
  assert.deepEqual(
    await db
      .select({ activityUri: ProfileBlockActivities.activityUri })
      .from(ProfileBlockActivities)
      .where(eq(ProfileBlockActivities.state, 'ACTIVE')),
    [{ activityUri: firstActivity.activityUri }],
  );
  await assert.rejects(
    db.insert(ProfileBlockActivities).values({
      ...secondActivity,
      profileBlockId: first.result.profileBlockId,
    }),
  );
  const duplicateOriginal = await recordProfileBlockProtocolTombstone(firstActivity);
  assert.equal(duplicateOriginal.state, 'ACTIVE');
  assert.equal(duplicateOriginal.profileBlockId, first.result.profileBlockId);
  await recordProfileBlockProtocolTombstone(secondActivity);
  assert.equal(await currentProfileBlockId(owner.id, target.id), first.result.profileBlockId);
  const unblock = await executeProfileUnblockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: first.result.profileBlockId,
    protocolActivityUri: firstActivity.activityUri,
  });
  assert.equal(unblock.ok && unblock.result.removed, true);
  assert.equal(await currentProfileBlockId(owner.id, target.id), null);
  const originals = await db
    .select({
      activityUri: ProfileBlockActivities.activityUri,
      closedAt: ProfileBlockActivities.closedAt,
      state: ProfileBlockActivities.state,
    })
    .from(ProfileBlockActivities)
    .where(
      inArray(ProfileBlockActivities.activityUri, [
        firstActivity.activityUri,
        secondActivity.activityUri,
      ]),
    );
  assert.equal(originals.length, 2);
  assert.ok(originals.every((original) => original.state === 'CLOSED' && original.closedAt));

  const third = await block(
    protocolActivity(`https://remote.example/activities/${crypto.randomUUID()}`),
  );
  assert.equal(third.ok && third.result.created, true);
  const retriedUndo = await executeProfileUnblockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: first.result.profileBlockId,
    protocolActivityUri: firstActivity.activityUri,
  });
  assert.equal(retriedUndo.ok && retriedUndo.result.removed, false);
  if (third.ok) {
    assert.equal(await currentProfileBlockId(owner.id, target.id), third.result.profileBlockId);
  }
});

test('local Unblock closes the old original before reblock and old Undo retry', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const original = await executeProfileBlockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL',
  });
  assert.equal(original.ok, true);
  if (!original.ok) {
    return;
  }

  const oldActivityUri = `https://local.example/activities/${crypto.randomUUID()}`;
  await db.insert(ProfileBlockActivities).values({
    activityUri: oldActivityUri,
    actorUri: `https://local.example/ap/actor/${owner.id}`,
    objectUri: `https://remote.example/users/${target.id}`,
    origin: 'OUTBOUND',
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: original.result.profileBlockId,
  });

  const unblock = await executeProfileUnblockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: original.result.profileBlockId,
  });
  assert.equal(unblock.ok && unblock.result.removed, true);
  assert.deepEqual(
    await db
      .select({ state: ProfileBlockActivities.state })
      .from(ProfileBlockActivities)
      .where(eq(ProfileBlockActivities.activityUri, oldActivityUri)),
    [{ state: 'CLOSED' }],
  );

  const replacement = await executeProfileBlockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL',
  });
  assert.equal(replacement.ok && replacement.result.created, true);
  if (!replacement.ok) {
    return;
  }
  const staleUndo = await executeProfileUnblockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: original.result.profileBlockId,
  });
  assert.equal(staleUndo.ok && staleUndo.result.removed, false);
  assert.equal(await currentProfileBlockId(owner.id, target.id), replacement.result.profileBlockId);
});

test('inbound Undo tombstone prevents a late Block without creating a relation', async () => {
  const { profile: owner } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const { profile: target } = await createProfile();
  const protocolActivity = {
    activityUri: `https://remote.example/activities/${crypto.randomUUID()}`,
    actorUri: `https://remote.example/users/${owner.id}`,
    objectUri: `https://local.example/ap/actor/${target.id}`,
    origin: 'INBOUND' as const,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  };
  await recordProfileBlockProtocolTombstone(protocolActivity);
  const result = await executeProfileBlockTransitionActivity({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'ACTIVITYPUB',
    protocolActivity,
  });
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'CONFLICT', message: 'Profile Block activity has already been closed' },
  });
  assert.equal(await currentProfileBlockId(owner.id, target.id), null);
  assert.deepEqual(
    await db
      .select({
        state: ProfileBlockActivities.state,
        profileBlockId: ProfileBlockActivities.profileBlockId,
      })
      .from(ProfileBlockActivities)
      .where(eq(ProfileBlockActivities.activityUri, protocolActivity.activityUri)),
    [{ state: 'CLOSED', profileBlockId: null }],
  );
});
