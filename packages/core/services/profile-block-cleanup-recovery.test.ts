import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, firstOrThrow, Instances, Notifications, pg, ProfileBlocks, Profiles } from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { createFollowNotification } from './notification';
import {
  deleteProfileBlock,
  executeProfileBlockTransition,
  executeProfileUnblockTransition,
} from './profile-block';
import { ensureProfileFollow } from './profile-follow-relation';

const profileIds = new Set<string>();
const instanceIds = new Set<string>();

const createProfile = async (kind: InstanceKind = InstanceKind.LOCAL) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind,
      state: InstanceState.ACTIVE,
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
  return profile;
};

const loadCleanupBatches = async (ownerProfileId: string, targetProfileId: string) =>
  db.execute<{
    operation: 'BLOCK' | 'UNBLOCK';
    operation_id: string;
    profile_block_id: string;
    changed: boolean;
    effect_plan: unknown;
    settled_at: string | null;
  }>(sql`
    SELECT operation, operation_id, profile_block_id, changed, effect_plan, settled_at
      FROM profile_block_cleanup_batch
     WHERE owner_profile_id = ${ownerProfileId}
       AND target_profile_id = ${targetProfileId}
     ORDER BY created_at
  `);

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

test('Unblock receipt replays its committed cleanup plan after product replacement', async () => {
  const owner = await createProfile();
  const target = await createProfile(InstanceKind.LOCAL);
  const follow = await ensureProfileFollow({
    followerProfileId: owner.id,
    followeeProfileId: target.id,
  });
  const blockId = '00000000-0000-7000-8000-000000000901';
  await createFollowNotification(follow.profileFollow.id);
  await db.insert(ProfileBlocks).values({
    id: blockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const unblockOperationId = '00000000-0000-7000-8000-000000000902';
  const unblockInput = {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL' as const,
    expectedProfileBlockId: blockId,
    operationId: unblockOperationId,
    cleanupSources: [
      {
        sourceId: follow.profileFollow.id,
        sourceKind: 'FOLLOW' as const,
        followerProfileId: owner.id,
        followeeProfileId: target.id,
      },
    ],
  };
  const firstUnblock = await executeProfileUnblockTransition(unblockInput);
  assert.equal(firstUnblock.ok, true);
  if (!firstUnblock.ok) {
    return;
  }
  assert.equal(firstUnblock.result.removed, true);
  const firstBatches = (await loadCleanupBatches(owner.id, target.id)).filter(
    ({ operation }) => operation === 'UNBLOCK',
  );
  assert.equal(firstBatches.length, 1);
  assert.deepEqual(firstBatches[0]?.effect_plan, [
    {
      kind: 'DELETE',
      input: {
        sourceId: follow.profileFollow.id,
        sourceKind: 'FOLLOW',
        followerProfileId: owner.id,
        followeeProfileId: target.id,
        sendActivityPub: false,
      },
    },
  ]);
  assert.equal(
    await db
      .select()
      .from(Notifications)
      .where(
        and(
          eq(Notifications.kind, NotificationKind.FOLLOW),
          eq(Notifications.sourceId, follow.profileFollow.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );

  // Simulate a Worker response loss: the product row is removed/replaced while
  // the committed cleanup effects have not run yet.
  assert.equal(
    (
      await deleteProfileBlock({
        ownerProfileId: owner.id,
        targetProfileId: target.id,
        profileBlockId: blockId,
      })
    )?.id,
    blockId,
  );
  const replacementBlockId = '00000000-0000-7000-8000-000000000903';
  await db.insert(ProfileBlocks).values({
    id: replacementBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const retry = await executeProfileUnblockTransition({
    ...unblockInput,
    cleanupSources: [],
  });
  assert.equal(retry.ok, true);
  if (!retry.ok) {
    return;
  }
  assert.deepEqual(retry, firstUnblock);
  const batches = (await loadCleanupBatches(owner.id, target.id)).filter(
    ({ operation }) => operation === 'UNBLOCK',
  );
  assert.equal(batches.length, 1);
  assert.equal(batches[0]?.operation_id, unblockOperationId);
  assert.equal(batches[0]?.profile_block_id, blockId);
  assert.deepEqual(batches[0]?.effect_plan, firstBatches[0]?.effect_plan);
  assert.equal(batches[0]?.settled_at, null);
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, replacementBlockId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(Notifications)
      .where(
        and(
          eq(Notifications.kind, NotificationKind.FOLLOW),
          eq(Notifications.sourceId, follow.profileFollow.id),
        ),
      )
      .then((rows) => rows.length),
    1,
  );
});

test('Block receipt preserves created:false and empty plan after response loss', async () => {
  const owner = await createProfile();
  const target = await createProfile(InstanceKind.LOCAL);
  const blockId = '00000000-0000-7000-8000-000000000911';
  const candidateBlockId = '00000000-0000-7000-8000-000000000912';
  await db.insert(ProfileBlocks).values({
    id: blockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const input = {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL' as const,
    candidateProfileBlockId: candidateBlockId,
    cleanupSources: [],
  };
  const first = await executeProfileBlockTransition(input);
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  assert.deepEqual(first.result, {
    created: false,
    profileBlockId: blockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  await deleteProfileBlock({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: blockId,
  });
  const replacementBlockId = '00000000-0000-7000-8000-000000000913';
  await db.insert(ProfileBlocks).values({
    id: replacementBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const batches = (await loadCleanupBatches(owner.id, target.id)).filter(
    ({ operation }) => operation === 'BLOCK',
  );
  assert.equal(batches.length, 1);
  assert.equal(batches[0]?.operation_id, candidateBlockId);
  assert.equal(batches[0]?.changed, false);
  assert.deepEqual(batches[0]?.effect_plan, []);

  const retry = await executeProfileBlockTransition(input);
  assert.equal(retry.ok, true);
  if (!retry.ok) {
    return;
  }
  assert.deepEqual(retry, first);
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, replacementBlockId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, blockId))
      .then((rows) => rows.length),
    0,
  );
});

test('Created Block with an empty plan replays its original generation after replacement', async () => {
  const owner = await createProfile();
  const target = await createProfile(InstanceKind.LOCAL);
  const blockId = '00000000-0000-7000-8000-000000000921';
  const replacementBlockId = '00000000-0000-7000-8000-000000000922';
  await db.insert(ProfileBlocks).values({
    id: blockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  await deleteProfileBlock({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: blockId,
  });

  const input = {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL' as const,
    candidateProfileBlockId: blockId,
    cleanupSources: [],
  };
  const first = await executeProfileBlockTransition(input);
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  assert.equal(first.result.created, true);

  await deleteProfileBlock({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: blockId,
  });
  await db.insert(ProfileBlocks).values({
    id: replacementBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const retry = await executeProfileBlockTransition(input);
  assert.equal(retry.ok, true);
  if (!retry.ok) {
    return;
  }
  assert.deepEqual(retry, first);
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, replacementBlockId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, blockId))
      .then((rows) => rows.length),
    0,
  );
});
