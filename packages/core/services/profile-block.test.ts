import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  Bookmarks,
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  PostContents,
  Posts,
  ProfileBlockActivities,
  ProfileBlockCleanupBatches,
  ProfileBlocks,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  Reactions,
} from '../db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError } from '../error';
import { postContentDocumentFromText } from '../post-content/server';
import { createPost as createPostAction, repostPost } from './post';
import {
  deleteProfileBlock,
  executeProfileBlockTransition,
  executeProfileUnblockTransition,
  loadProfileBlockTransitionBootstrap,
} from './profile-block';
import { ProfilePairBlockedError } from './profile-block-policy';
import { executeProfileFollowPairTransition } from './profile-follow-command';
import { ensureProfileFollow } from './profile-follow-relation';
import {
  followProfileInTransaction,
  loadProfileFollowRemovalSourcesBetweenProfiles,
} from './profile-follow-transaction';
import { addReaction } from './reaction';

const profileIds = new Set<string>();
const instanceIds = new Set<string>();
const postIds: string[] = [];

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

const createPost = async (profileId: string) => {
  const post = await db
    .insert(Posts)
    .values({
      profileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  postIds.push(post.id);
  return post;
};

const pairRows = (firstProfileId: string, secondProfileId: string) =>
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
  // Reposts point at their source without ON DELETE CASCADE, so remove posts
  // in reverse creation order before their owning Profiles.
  if (postIds.length > 0) {
    await db.update(Posts).set({ currentContentId: null }).where(inArray(Posts.id, postIds));
    await db.delete(PostContents).where(inArray(PostContents.postId, postIds));
  }
  for (const postId of [...postIds].reverse()) {
    await db.delete(Posts).where(eq(Posts.id, postId));
  }
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
  }
  profileIds.clear();
  instanceIds.clear();
  postIds.length = 0;
});

after(async () => {
  await pg.end();
});

test('Block removes captured Follow generations and preserves existing Reactions', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const ownerPost = await createPost(owner.id);
  const targetPost = await createPost(target.id);
  const requestOwnerToTargetId = '00000000-0000-4000-8000-000000000401';
  const requestTargetToOwnerId = '00000000-0000-4000-8000-000000000402';

  const followOwnerToTargetId = (
    await ensureProfileFollow({ followerProfileId: owner.id, followeeProfileId: target.id })
  ).profileFollow.id;
  const followTargetToOwnerId = (
    await ensureProfileFollow({ followerProfileId: target.id, followeeProfileId: owner.id })
  ).profileFollow.id;
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

  const targetOnOwnerReaction = await db
    .insert(Reactions)
    .values({ postId: ownerPost.id, profileId: target.id, type: 'LIKE' })
    .returning()
    .then(firstOrThrow);
  const targetOnTargetReaction = await db
    .insert(Reactions)
    .values({ postId: targetPost.id, profileId: target.id, type: 'LOVE' })
    .returning()
    .then(firstOrThrow);
  const ownerOnOwnerReaction = await db
    .insert(Reactions)
    .values({ postId: ownerPost.id, profileId: owner.id, type: 'LAUGH' })
    .returning()
    .then(firstOrThrow);
  const readAt = Temporal.Instant.from('2026-01-01T00:00:00Z');
  await db.insert(Notifications).values([
    {
      kind: NotificationKind.FOLLOW,
      recipientProfileId: target.id,
      sourceId: followOwnerToTargetId,
    },
    {
      kind: NotificationKind.FOLLOW_REQUEST,
      recipientProfileId: target.id,
      sourceId: requestOwnerToTargetId,
    },
    {
      kind: NotificationKind.REACTION,
      recipientProfileId: owner.id,
      sourceId: targetOnOwnerReaction.id,
      readAt,
    },
  ]);
  const bookmark = await db
    .insert(Bookmarks)
    .values({ profileId: target.id, postId: ownerPost.id })
    .returning()
    .then(firstOrThrow);
  const repost = await db
    .insert(Posts)
    .values({
      profileId: target.id,
      repostSourceId: ownerPost.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.UNLISTED,
    })
    .returning()
    .then(firstOrThrow);
  postIds.push(repost.id);

  const { candidateProfileBlockId, cleanupSources } = await loadProfileBlockTransitionBootstrap({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  assert.match(
    candidateProfileBlockId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const input = {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL' as const,
    cleanupSources,
    candidateProfileBlockId,
  };
  const firstExecution = await executeProfileBlockTransition(input);
  assert.equal(firstExecution.ok, true);
  if (!firstExecution.ok) {
    return;
  }
  assert.deepEqual(firstExecution.result, {
    created: true,
    profileBlockId: candidateProfileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  const firstBatch = await db
    .select()
    .from(ProfileBlockCleanupBatches)
    .where(
      and(
        eq(ProfileBlockCleanupBatches.operation, 'BLOCK'),
        eq(ProfileBlockCleanupBatches.operationId, candidateProfileBlockId),
      ),
    )
    .then(firstOrThrow);
  assert.deepEqual(firstBatch.effectPlan, [
    {
      kind: 'DELETE',
      input: {
        sourceId: followOwnerToTargetId,
        sourceKind: 'FOLLOW',
        followerProfileId: owner.id,
        followeeProfileId: target.id,
        sendActivityPub: true,
      },
    },
    {
      kind: 'DELETE',
      input: {
        sourceId: requestOwnerToTargetId,
        sourceKind: 'FOLLOW_REQUEST',
        followerProfileId: owner.id,
        followeeProfileId: target.id,
        sendActivityPub: true,
      },
    },
    {
      kind: 'DELETE',
      input: {
        sourceId: followTargetToOwnerId,
        sourceKind: 'FOLLOW',
        followerProfileId: target.id,
        followeeProfileId: owner.id,
        sendActivityPub: false,
      },
    },
    {
      kind: 'DELETE',
      input: {
        sourceId: requestTargetToOwnerId,
        sourceKind: 'FOLLOW_REQUEST',
        followerProfileId: target.id,
        followeeProfileId: owner.id,
        sendActivityPub: false,
      },
    },
  ]);

  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(pairRows(owner.id, target.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(
        or(
          and(
            eq(ProfileFollowRequests.followerProfileId, owner.id),
            eq(ProfileFollowRequests.followeeProfileId, target.id),
          ),
          and(
            eq(ProfileFollowRequests.followerProfileId, target.id),
            eq(ProfileFollowRequests.followeeProfileId, owner.id),
          ),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
  const counters = await db
    .select({ followersCount: Profiles.followersCount, followingCount: Profiles.followingCount })
    .from(Profiles)
    .where(inArray(Profiles.id, [owner.id, target.id]));
  assert.deepEqual(
    counters.map(({ followersCount, followingCount }) => ({ followersCount, followingCount })),
    Array.from({ length: 2 }, () => ({ followersCount: 0, followingCount: 0 })),
  );

  const assertReactionsAndNotificationPreserved = async () => {
    const expectedReactions = [
      targetOnOwnerReaction,
      targetOnTargetReaction,
      ownerOnOwnerReaction,
    ].sort((left, right) => left.id.localeCompare(right.id));
    const actualReactions = await db
      .select()
      .from(Reactions)
      .where(
        inArray(Reactions.id, [
          targetOnOwnerReaction.id,
          targetOnTargetReaction.id,
          ownerOnOwnerReaction.id,
        ]),
      )
      .then((rows) => rows.sort((left, right) => left.id.localeCompare(right.id)));
    assert.deepEqual(actualReactions, expectedReactions);

    const preservedNotification = await db
      .select()
      .from(Notifications)
      .where(
        and(
          eq(Notifications.kind, NotificationKind.REACTION),
          eq(Notifications.sourceId, targetOnOwnerReaction.id),
        ),
      )
      .then(firstOrThrow);
    assert.equal(preservedNotification.readAt?.toString(), readAt.toString());
  };

  await assertReactionsAndNotificationPreserved();
  assert.deepEqual(await db.select().from(Bookmarks).where(eq(Bookmarks.postId, ownerPost.id)), [
    bookmark,
  ]);
  assert.deepEqual(
    await db.select().from(Posts).where(eq(Posts.id, repost.id)).then(firstOrThrow),
    repost,
  );
  // Replaying after Activity completion loss reconstructs the same effect
  // plan, while exact source IDs keep a newer Follow generation intact.
  const retry = await executeProfileBlockTransition(input);
  assert.equal(retry.ok, true);
  if (!retry.ok) {
    return;
  }
  assert.deepEqual(retry.result, firstExecution.result);
  assert.deepEqual(
    (
      await db
        .select()
        .from(ProfileBlockCleanupBatches)
        .where(
          and(
            eq(ProfileBlockCleanupBatches.operation, 'BLOCK'),
            eq(ProfileBlockCleanupBatches.operationId, candidateProfileBlockId),
          ),
        )
        .then(firstOrThrow)
    ).effectPlan,
    firstBatch.effectPlan,
  );
  await assertReactionsAndNotificationPreserved();

  const newFollowId = (
    await ensureProfileFollow({ followerProfileId: owner.id, followeeProfileId: target.id })
  ).profileFollow.id;
  const retryWithNewGeneration = await executeProfileBlockTransition(input);
  assert.equal(retryWithNewGeneration.ok, true);
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, newFollowId))
      .then((rows) => rows.length),
    1,
  );
  const ownerAfterRetry = await db
    .select({ followingCount: Profiles.followingCount })
    .from(Profiles)
    .where(eq(Profiles.id, owner.id))
    .then(firstOrThrow);
  assert.equal(ownerAfterRetry.followingCount, 1);
  await assertReactionsAndNotificationPreserved();

  assert.equal(
    (
      await deleteProfileBlock({
        ownerProfileId: owner.id,
        targetProfileId: target.id,
        profileBlockId: candidateProfileBlockId,
      })
    )?.id,
    candidateProfileBlockId,
  );
  assert.equal(
    await deleteProfileBlock({
      ownerProfileId: target.id,
      targetProfileId: owner.id,
      profileBlockId: candidateProfileBlockId,
    }),
    null,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, followOwnerToTargetId))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, newFollowId))
      .then((rows) => rows.length),
    1,
  );
  await assertReactionsAndNotificationPreserved();
});

test('Unblock cleans current Follow generations before removing the exact Block', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const profileBlockId = '00000000-0000-4000-8000-000000000801';
  const requestOwnerToTargetId = '00000000-0000-4000-8000-000000000804';
  const requestTargetToOwnerId = '00000000-0000-4000-8000-000000000805';
  const replacementProfileBlockId = '00000000-0000-4000-8000-000000000807';

  await db.insert(ProfileBlocks).values({
    id: profileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  const followOwnerToTargetId = (
    await ensureProfileFollow({ followerProfileId: owner.id, followeeProfileId: target.id })
  ).profileFollow.id;
  const followTargetToOwnerId = (
    await ensureProfileFollow({ followerProfileId: target.id, followeeProfileId: owner.id })
  ).profileFollow.id;
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
  ]);

  const cleanupSources = await loadProfileFollowRemovalSourcesBetweenProfiles({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  const input = {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL' as const,
    expectedProfileBlockId: profileBlockId,
    operationId: crypto.randomUUID(),
    cleanupSources,
  };
  const firstExecution = await executeProfileUnblockTransition(input);
  assert.equal(firstExecution.ok, true);
  if (!firstExecution.ok) {
    return;
  }
  assert.deepEqual(firstExecution.result, {
    removed: true,
    profileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  const firstBatch = await db
    .select()
    .from(ProfileBlockCleanupBatches)
    .where(
      and(
        eq(ProfileBlockCleanupBatches.operation, 'UNBLOCK'),
        eq(ProfileBlockCleanupBatches.operationId, input.operationId),
      ),
    )
    .then(firstOrThrow);
  assert.deepEqual(
    firstBatch.effectPlan.map(({ input: effectInput }) => ({
      sourceId: effectInput.sourceId,
      sourceKind: effectInput.sourceKind,
    })),
    cleanupSources.map(({ sourceId, sourceKind }) => ({ sourceId, sourceKind })),
  );
  assert.equal(await currentProfileBlockId(owner.id, target.id), profileBlockId);
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(pairRows(owner.id, target.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(
        or(
          and(
            eq(ProfileFollowRequests.followerProfileId, owner.id),
            eq(ProfileFollowRequests.followeeProfileId, target.id),
          ),
          and(
            eq(ProfileFollowRequests.followerProfileId, target.id),
            eq(ProfileFollowRequests.followeeProfileId, owner.id),
          ),
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
        inArray(Notifications.sourceId, [
          followOwnerToTargetId,
          followTargetToOwnerId,
          requestOwnerToTargetId,
          requestTargetToOwnerId,
        ]),
      )
      .then((rows) => rows.length),
    4,
  );

  // A completion-loss retry receives the same history-captured sources and
  // rebuilds the required effects even though their rows are already gone.
  const retry = await executeProfileUnblockTransition(input);
  assert.equal(retry.ok, true);
  if (!retry.ok) {
    return;
  }
  assert.deepEqual(retry.result, firstExecution.result);
  assert.deepEqual(
    (
      await db
        .select()
        .from(ProfileBlockCleanupBatches)
        .where(
          and(
            eq(ProfileBlockCleanupBatches.operation, 'UNBLOCK'),
            eq(ProfileBlockCleanupBatches.operationId, input.operationId),
          ),
        )
        .then(firstOrThrow)
    ).effectPlan,
    firstBatch.effectPlan,
  );
  assert.equal(await currentProfileBlockId(owner.id, target.id), profileBlockId);

  // A later Unblock run captures and removes a Follow generation created while
  // the original Block is still active.
  const lateFollowId = (
    await ensureProfileFollow({ followerProfileId: owner.id, followeeProfileId: target.id })
  ).profileFollow.id;
  await db.insert(Notifications).values({
    kind: NotificationKind.FOLLOW,
    recipientProfileId: target.id,
    sourceId: lateFollowId,
  });
  const lateCleanupSources = await loadProfileFollowRemovalSourcesBetweenProfiles({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
  const lateOperationId = crypto.randomUUID();
  const lateExecution = await executeProfileUnblockTransition({
    ...input,
    operationId: lateOperationId,
    cleanupSources: lateCleanupSources,
  });
  assert.equal(lateExecution.ok, true);
  if (!lateExecution.ok) {
    return;
  }
  assert.deepEqual(lateExecution.result, firstExecution.result);
  assert.deepEqual(
    (
      await db
        .select()
        .from(ProfileBlockCleanupBatches)
        .where(
          and(
            eq(ProfileBlockCleanupBatches.operation, 'UNBLOCK'),
            eq(ProfileBlockCleanupBatches.operationId, lateOperationId),
          ),
        )
        .then(firstOrThrow)
    ).effectPlan.map(({ input: effectInput }) => effectInput.sourceId),
    [lateFollowId],
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, lateFollowId))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(await currentProfileBlockId(owner.id, target.id), profileBlockId);

  assert.equal(
    (
      await deleteProfileBlock({
        ownerProfileId: owner.id,
        targetProfileId: target.id,
        profileBlockId,
      })
    )?.id,
    profileBlockId,
  );
  await db.insert(ProfileBlocks).values({
    id: replacementProfileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  assert.equal(
    await deleteProfileBlock({
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      profileBlockId,
    }),
    null,
  );
  assert.equal(await currentProfileBlockId(owner.id, target.id), replacementProfileBlockId);

  const staleUnblock = await executeProfileUnblockTransition({
    ...input,
    operationId: crypto.randomUUID(),
    cleanupSources: [],
  });
  assert.deepEqual(staleUnblock, {
    ok: true,
    result: {
      removed: false,
      profileBlockId: null,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
    },
  });
  assert.equal(
    (
      await deleteProfileBlock({
        ownerProfileId: owner.id,
        targetProfileId: target.id,
        profileBlockId: replacementProfileBlockId,
      })
    )?.id,
    replacementProfileBlockId,
  );
  assert.equal(await currentProfileBlockId(owner.id, target.id), null);
});

test('legacy Unblock marks its exact relation while settlement is pending', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const profileBlockId = crypto.randomUUID();
  await db.insert(ProfileBlocks).values({
    id: profileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const execution = await executeProfileUnblockTransition({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL',
    expectedProfileBlockId: profileBlockId,
    operationId: profileBlockId,
    cleanupSources: [],
  });
  assert.deepEqual(execution, {
    ok: true,
    result: {
      removed: true,
      profileBlockId,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
    },
  });
  const [row] = await db.execute<{ closingAt: string | null }>(sql`
    SELECT closing_at AS "closingAt"
    FROM profile_block
    WHERE id = ${profileBlockId}
  `);
  assert.ok(row?.closingAt);
});

test('legacy Unblock marker protects a replacement Block from stale exact deletion', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const oldProfileBlockId = crypto.randomUUID();
  const newProfileBlockId = crypto.randomUUID();
  await db.insert(ProfileBlocks).values({
    id: oldProfileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const unblock = await executeProfileUnblockTransition({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'LOCAL',
    expectedProfileBlockId: oldProfileBlockId,
    operationId: oldProfileBlockId,
    cleanupSources: [],
  });
  assert.equal(unblock.ok, true);
  if (!unblock.ok) {
    return;
  }

  const [reblock, staleDelete] = await Promise.all([
    executeProfileBlockTransition({
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      origin: 'LOCAL',
      cleanupSources: [],
      candidateProfileBlockId: newProfileBlockId,
    }),
    deleteProfileBlock({
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      profileBlockId: oldProfileBlockId,
    }),
  ]);
  assert.deepEqual(reblock, {
    ok: true,
    result: {
      created: true,
      profileBlockId: newProfileBlockId,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
    },
  });
  assert.ok(staleDelete === null || staleDelete.id === oldProfileBlockId);
  assert.equal(await currentProfileBlockId(owner.id, target.id), newProfileBlockId);
});

test('Block replaces a CLOSING generation before an old exact delete can remove the candidate', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const oldProfileBlockId = crypto.randomUUID();
  const newProfileBlockId = crypto.randomUUID();
  const oldActivityUri = `https://remote.example/activities/${crypto.randomUUID()}`;
  const newActivityUri = `https://remote.example/activities/${crypto.randomUUID()}`;
  await db.insert(ProfileBlocks).values({
    id: oldProfileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  await db.insert(ProfileBlockActivities).values({
    activityUri: oldActivityUri,
    actorUri: `https://remote.example/users/${owner.handle}`,
    objectUri: `https://local.example/ap/actor/${target.id}`,
    origin: 'INBOUND',
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId: oldProfileBlockId,
    state: 'CLOSING',
  });

  let releaseRelation!: () => void;
  const relationRelease = new Promise<void>((resolve) => {
    releaseRelation = resolve;
  });
  let relationLocked!: () => void;
  const relationLockedPromise = new Promise<void>((resolve) => {
    relationLocked = resolve;
  });
  const relationLock = db.transaction(async (tx) => {
    await tx
      .update(ProfileBlocks)
      .set({ ownerProfileId: sql`${ProfileBlocks.ownerProfileId}` })
      .where(eq(ProfileBlocks.id, oldProfileBlockId))
      .returning({ id: ProfileBlocks.id });
    relationLocked();
    await relationRelease;
  });
  await relationLockedPromise;

  const input = {
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'ACTIVITYPUB' as const,
    cleanupSources: [],
    candidateProfileBlockId: newProfileBlockId,
    protocolActivity: {
      activityUri: newActivityUri,
      actorUri: `https://remote.example/users/${owner.handle}`,
      objectUri: `https://local.example/ap/actor/${target.id}`,
      origin: 'INBOUND' as const,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
    },
  };
  const executionPromise = executeProfileBlockTransition(input);
  const oldDeletePromise = db.transaction((tx) =>
    tx
      .delete(ProfileBlocks)
      .where(eq(ProfileBlocks.id, oldProfileBlockId))
      .returning({ id: ProfileBlocks.id })
      .then((rows) => rows[0]),
  );
  await new Promise((resolve) => setTimeout(resolve, 25));
  releaseRelation();
  const [execution] = await Promise.all([executionPromise, oldDeletePromise, relationLock]);

  assert.deepEqual(execution, {
    ok: true,
    result: {
      created: true,
      profileBlockId: newProfileBlockId,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      protocol: {
        activityUri: newActivityUri,
        profileBlockId: newProfileBlockId,
        status: 'ACTIVE',
      },
    },
  });
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, oldProfileBlockId))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileBlocks)
      .where(eq(ProfileBlocks.id, newProfileBlockId))
      .then((rows) => rows.length),
    1,
  );
  assert.deepEqual(
    await db
      .select({
        activityUri: ProfileBlockActivities.activityUri,
        profileBlockId: ProfileBlockActivities.profileBlockId,
      })
      .from(ProfileBlockActivities)
      .where(inArray(ProfileBlockActivities.activityUri, [oldActivityUri, newActivityUri]))
      .then((rows) =>
        rows.sort((left, right) => left.activityUri.localeCompare(right.activityUri)),
      ),
    [
      { activityUri: oldActivityUri, profileBlockId: oldProfileBlockId },
      { activityUri: newActivityUri, profileBlockId: newProfileBlockId },
    ].sort((left, right) => left.activityUri.localeCompare(right.activityUri)),
  );
});

test('Block rechecks the protocol after relation serialization before replaying a closing generation', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const profileBlockId = crypto.randomUUID();
  const activityUri = `https://remote.example/activities/${crypto.randomUUID()}`;
  await db.insert(ProfileBlocks).values({
    id: profileBlockId,
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });
  await db.insert(ProfileBlockActivities).values({
    activityUri,
    actorUri: `https://remote.example/users/${owner.handle}`,
    objectUri: `https://local.example/ap/actor/${target.id}`,
    origin: 'INBOUND',
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    profileBlockId,
    state: 'ACTIVE',
  });

  let releaseRelation!: () => void;
  const relationRelease = new Promise<void>((resolve) => {
    releaseRelation = resolve;
  });
  let relationLocked!: () => void;
  const relationLockedPromise = new Promise<void>((resolve) => {
    relationLocked = resolve;
  });
  const relationLock = db.transaction(async (tx) => {
    await tx
      .update(ProfileBlocks)
      .set({ ownerProfileId: sql`${ProfileBlocks.ownerProfileId}` })
      .where(eq(ProfileBlocks.id, profileBlockId))
      .returning({ id: ProfileBlocks.id });
    relationLocked();
    await relationRelease;
  });
  await relationLockedPromise;

  const replayPromise = executeProfileBlockTransition({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'ACTIVITYPUB',
    cleanupSources: [],
    candidateProfileBlockId: profileBlockId,
    protocolActivity: {
      activityUri,
      actorUri: `https://remote.example/users/${owner.handle}`,
      objectUri: `https://local.example/ap/actor/${target.id}`,
      origin: 'INBOUND',
      ownerProfileId: owner.id,
      targetProfileId: target.id,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  await db
    .update(ProfileBlockActivities)
    .set({ state: 'CLOSING', updatedAt: sql`now()` })
    .where(eq(ProfileBlockActivities.activityUri, activityUri));
  releaseRelation();

  const [replay] = await Promise.all([replayPromise, relationLock]);
  assert.deepEqual(replay, {
    ok: true,
    result: {
      created: false,
      profileBlockId,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      protocol: {
        activityUri,
        profileBlockId,
        status: 'CLOSING',
      },
    },
  });
  assert.equal(await currentProfileBlockId(owner.id, target.id), profileBlockId);
});

test('Block transaction does not recreate a relation when a concurrent Undo tombstone wins', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const activityUri = `https://remote.example/activities/${crypto.randomUUID()}`;
  const candidateProfileBlockId = crypto.randomUUID();
  let releaseTombstone!: () => void;
  const tombstoneReleased = new Promise<void>((resolve) => {
    releaseTombstone = resolve;
  });
  let tombstoneInserted!: () => void;
  const tombstoneInsertedPromise = new Promise<void>((resolve) => {
    tombstoneInserted = resolve;
  });

  const tombstoneTransaction = db.transaction(async (tx) => {
    await tx.insert(ProfileBlockActivities).values({
      activityUri,
      actorUri: `https://remote.example/users/${owner.handle}`,
      objectUri: `https://local.example/ap/actor/${target.id}`,
      origin: 'INBOUND',
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      profileBlockId: candidateProfileBlockId,
      state: 'CLOSED',
      closedAt: sql`now()`,
    });
    tombstoneInserted();
    await tombstoneReleased;
  });
  await tombstoneInsertedPromise;

  const blockTransaction = executeProfileBlockTransition({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
    origin: 'ACTIVITYPUB',
    cleanupSources: [],
    candidateProfileBlockId,
    protocolActivity: {
      activityUri,
      actorUri: `https://remote.example/users/${owner.handle}`,
      objectUri: `https://local.example/ap/actor/${target.id}`,
      origin: 'INBOUND',
      ownerProfileId: owner.id,
      targetProfileId: target.id,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  releaseTombstone();

  const [tombstoneResult, blockResult] = await Promise.all([
    tombstoneTransaction,
    blockTransaction,
  ]);
  assert.equal(tombstoneResult, undefined);
  assert.deepEqual(blockResult, {
    ok: true,
    result: {
      created: false,
      profileBlockId: candidateProfileBlockId,
      ownerProfileId: owner.id,
      targetProfileId: target.id,
      protocol: {
        activityUri,
        profileBlockId: candidateProfileBlockId,
        status: 'CLOSED',
      },
    },
  });
  assert.equal(await currentProfileBlockId(owner.id, target.id), null);
});

test('Block rejects self-blocking in the service and the database check', async () => {
  const { profile } = await createProfile();

  const execution = await executeProfileBlockTransition({
    ownerProfileId: profile.id,
    targetProfileId: profile.id,
    origin: 'LOCAL',
    candidateProfileBlockId: crypto.randomUUID(),
    cleanupSources: [],
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

test('Active Block rejects new Follow and approval in either direction', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  await db.insert(ActivityPubActors).values({
    profileId: target.id,
    type: ActivityPubActorType.PERSON,
    uri: `https://${target.handle}.example/users/${target.handle}`,
  });

  await db.insert(ProfileBlocks).values({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  await assert.rejects(
    db.transaction((tx) =>
      followProfileInTransaction({ followerProfileId: owner.id, followeeProfileId: target.id }, tx),
    ),
    (error: unknown) => error instanceof NotFoundError,
  );
  await assert.rejects(
    db.transaction((tx) =>
      followProfileInTransaction({ followerProfileId: target.id, followeeProfileId: owner.id }, tx),
    ),
    (error: unknown) => error instanceof NotFoundError,
  );

  const activityPubFollow = await executeProfileFollowPairTransition({
    pair: { followerProfileId: target.id, followeeProfileId: owner.id },
    command: { kind: 'FOLLOW', origin: 'ACTIVITYPUB' },
  });
  assert.deepEqual(activityPubFollow, {
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Profile not found' },
  });
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, target.id),
          eq(ProfileFollows.followeeProfileId, owner.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );

  const existingFollow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId: owner.id, followeeProfileId: target.id })
    .returning()
    .then(firstOrThrow);
  const pendingRequest = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: owner.id, followeeProfileId: target.id })
    .returning()
    .then(firstOrThrow);
  const approval = await executeProfileFollowPairTransition({
    pair: { followerProfileId: owner.id, followeeProfileId: target.id },
    command: {
      actorProfileId: target.id,
      expectedRowId: pendingRequest.id,
      kind: 'APPROVE',
      origin: 'LOCAL',
    },
  });

  assert.deepEqual(approval, {
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Profile not found' },
  });
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, existingFollow.id))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, pendingRequest.id))
      .then((rows) => rows.length),
    1,
  );

  const activityPubPendingRequest = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: target.id, followeeProfileId: owner.id })
    .returning()
    .then(firstOrThrow);
  const activityPubAccept = await executeProfileFollowPairTransition({
    pair: { followerProfileId: target.id, followeeProfileId: owner.id },
    pendingRequestId: activityPubPendingRequest.id,
    command: {
      expectedRowId: activityPubPendingRequest.id,
      kind: 'ACCEPT',
      origin: 'ACTIVITYPUB',
    },
  });
  assert.deepEqual(activityPubAccept, {
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Profile not found' },
  });
  assert.equal(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, target.id),
          eq(ProfileFollows.followeeProfileId, owner.id),
        ),
      )
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, activityPubPendingRequest.id))
      .then((rows) => rows.length),
    1,
  );
});

test('Active Block rejects new local Reply, Reaction, and Repost in either direction', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile();
  const ownerPost = await createPostAction({
    document: postContentDocumentFromText('owner post'),
    origin: 'LOCAL',
    profileId: owner.id,
    visibility: PostVisibility.PUBLIC,
  });
  const targetPost = await createPostAction({
    document: postContentDocumentFromText('target post'),
    origin: 'LOCAL',
    profileId: target.id,
    visibility: PostVisibility.PUBLIC,
  });
  postIds.push(ownerPost.post.id, targetPost.post.id);

  await db.insert(ProfileBlocks).values({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  const assertBlocked = async (actorProfileId: string, sourcePostId: string) => {
    await assert.rejects(
      createPostAction({
        document: postContentDocumentFromText('blocked reply'),
        origin: 'LOCAL',
        profileId: actorProfileId,
        replyParentId: sourcePostId,
        visibility: PostVisibility.PUBLIC,
      }),
      (error: unknown) =>
        error instanceof ProfilePairBlockedError && error.message === 'Post not found',
    );
    await assert.rejects(
      addReaction({
        actorProfileId,
        origin: 'LOCAL',
        postId: sourcePostId,
        type: '🎉',
      }),
      (error: unknown) =>
        error instanceof ProfilePairBlockedError && error.message === 'Post not found',
    );
    await assert.rejects(
      repostPost({ actorProfileId, origin: 'LOCAL', sourcePostId }),
      (error: unknown) =>
        error instanceof ProfilePairBlockedError && error.message === 'Post not found',
    );
  };

  await assertBlocked(target.id, ownerPost.post.id);
  await assertBlocked(owner.id, targetPost.post.id);
  const postIdsForTest = [ownerPost.post.id, targetPost.post.id];
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(inArray(Posts.id, postIdsForTest))
      .then((rows) => rows.length),
    2,
  );
  assert.equal(
    await db
      .select()
      .from(Reactions)
      .where(inArray(Reactions.postId, postIdsForTest))
      .then((rows) => rows.length),
    0,
  );
});
