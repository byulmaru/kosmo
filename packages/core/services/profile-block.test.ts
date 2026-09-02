import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  Bookmarks,
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  Posts,
  ProfileBlocks,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  Reactions,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { deleteProfileBlock, executeProfileBlockTransition } from './profile-block';
import { ensureProfileFollow } from './profile-follow-relation';
import { loadProfileFollowRemovalSourcesBetweenProfiles } from './profile-follow-transaction';

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

afterEach(async () => {
  // Reposts point at their source without ON DELETE CASCADE, so remove posts
  // in reverse creation order before their owning Profiles.
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

test('Follow-owned source bootstrap captures both directions in stable order', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const followOwnerToTargetId = '00000000-0000-4000-8000-000000000101';
  const followTargetToOwnerId = '00000000-0000-4000-8000-000000000102';
  const requestOwnerToTargetId = '00000000-0000-4000-8000-000000000201';
  const requestTargetToOwnerId = '00000000-0000-4000-8000-000000000202';

  await ensureProfileFollow(
    { followerProfileId: owner.id, followeeProfileId: target.id },
    undefined,
    { id: followOwnerToTargetId },
  );
  await ensureProfileFollow(
    { followerProfileId: target.id, followeeProfileId: owner.id },
    undefined,
    { id: followTargetToOwnerId },
  );
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

  assert.deepEqual(
    await loadProfileFollowRemovalSourcesBetweenProfiles({
      firstProfileId: owner.id,
      secondProfileId: target.id,
    }),
    [
      {
        sourceId: followOwnerToTargetId,
        sourceKind: 'FOLLOW',
        followerProfileId: owner.id,
        followeeProfileId: target.id,
      },
      {
        sourceId: requestOwnerToTargetId,
        sourceKind: 'FOLLOW_REQUEST',
        followerProfileId: owner.id,
        followeeProfileId: target.id,
      },
      {
        sourceId: followTargetToOwnerId,
        sourceKind: 'FOLLOW',
        followerProfileId: target.id,
        followeeProfileId: owner.id,
      },
      {
        sourceId: requestTargetToOwnerId,
        sourceKind: 'FOLLOW_REQUEST',
        followerProfileId: target.id,
        followeeProfileId: owner.id,
      },
    ],
  );
});

test('Block removes captured Follow generations and preserves existing Reactions', async () => {
  const { profile: owner } = await createProfile();
  const { profile: target } = await createProfile({ instanceKind: InstanceKind.ACTIVITYPUB });
  const ownerPost = await createPost(owner.id);
  const targetPost = await createPost(target.id);
  const followOwnerToTargetId = '00000000-0000-4000-8000-000000000301';
  const followTargetToOwnerId = '00000000-0000-4000-8000-000000000302';
  const requestOwnerToTargetId = '00000000-0000-4000-8000-000000000401';
  const requestTargetToOwnerId = '00000000-0000-4000-8000-000000000402';
  const candidateProfileBlockId = '00000000-0000-4000-8000-000000000501';
  const newFollowId = '00000000-0000-4000-8000-000000000601';

  await ensureProfileFollow(
    { followerProfileId: owner.id, followeeProfileId: target.id },
    undefined,
    { id: followOwnerToTargetId },
  );
  await ensureProfileFollow(
    { followerProfileId: target.id, followeeProfileId: owner.id },
    undefined,
    { id: followTargetToOwnerId },
  );
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

  const cleanupSources = await loadProfileFollowRemovalSourcesBetweenProfiles({
    firstProfileId: owner.id,
    secondProfileId: target.id,
  });
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
  assert.deepEqual(firstExecution.effectPlan, [
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
  assert.equal(retry.result.created, false);
  assert.equal(retry.result.profileBlockId, candidateProfileBlockId);
  assert.deepEqual(retry.effectPlan, firstExecution.effectPlan);
  await assertReactionsAndNotificationPreserved();

  await ensureProfileFollow(
    { followerProfileId: owner.id, followeeProfileId: target.id },
    undefined,
    { id: newFollowId },
  );
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
      })
    )?.id,
    candidateProfileBlockId,
  );
  assert.equal(
    await deleteProfileBlock({ ownerProfileId: target.id, targetProfileId: owner.id }),
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

test('Block rejects self-blocking in the service and the database check', async () => {
  const { profile } = await createProfile();

  const execution = await executeProfileBlockTransition({
    ownerProfileId: profile.id,
    targetProfileId: profile.id,
    origin: 'LOCAL',
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
