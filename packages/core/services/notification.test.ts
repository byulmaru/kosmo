import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  PostContents,
  Posts,
  ProfileBlocks,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileMutes,
  Profiles,
  Reactions,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { createReplyNotification } from './create-reply-notification';
import {
  createFollowNotification,
  createFollowRequestNotification,
  createReactionNotification,
  createRepostNotification,
  deleteFollowRequestNotification,
  deleteNotificationBySource,
} from './notification';
import { materializeNotification } from './notification-policy';
import { createPost, repostPost } from './post';
import { followProfile, removeInboundFollow, unfollowProfile } from './profile-follow.test-helpers';
import { muteProfile, unmuteProfile } from './profile-mute';

const instanceIds: string[] = [];
const profileIds: string[] = [];
const accountIds: string[] = [];

const createProfile = async (kind: InstanceKind = InstanceKind.LOCAL) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);
  return profile;
};

const readNotifications = (sourceId: string) =>
  db.select().from(Notifications).where(eq(Notifications.sourceId, sourceId));

const createReaction = async (authorProfileId: string, recipientProfileId: string) => {
  const post = await db
    .insert(Posts)
    .values({
      profileId: recipientProfileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);

  return db
    .insert(Reactions)
    .values({ postId: post.id, profileId: authorProfileId, type: '🎉' })
    .returning()
    .then(firstOrThrow);
};

const createContentPost = (profileId: string) =>
  createPost({
    document: postContentDocumentFromText(crypto.randomUUID()),
    origin: 'LOCAL',
    profileId,
    visibility: PostVisibility.PUBLIC,
  }).then(({ post }) => post);

const getEstablishedFollow = (result: Awaited<ReturnType<typeof followProfile>>) => {
  if (result.result.kind !== 'ESTABLISHED') {
    assert.fail('Expected an established profile follow');
  }
  return result.result.profileFollow;
};

const notificationInsertLock = { classId: 873, objectId: 634 } as const;

const waitForAdvisoryLockBlock = async (
  { classId, objectId }: { classId: number; objectId: number },
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [lock] = await pg<{ waiting: number }[]>`
      SELECT count(*)::integer AS waiting
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND NOT granted
        AND classid = ${classId}
        AND objid = ${objectId}
    `;
    if ((lock?.waiting ?? 0) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail(message);
};

const waitForNotificationInsertBlock = async (): Promise<void> =>
  waitForAdvisoryLockBlock(
    notificationInsertLock,
    'Notification insert did not reach the advisory lock barrier',
  );

const runNotificationDeleteRace = async (
  createNotification: () => Promise<void>,
  deleteSource: () => Promise<unknown>,
): Promise<void> => {
  const lockSession = await pg.reserve();
  let lockHeld = false;
  let notificationTriggerInstalled = false;
  let notification: Promise<void> | undefined;
  let deletion: Promise<unknown> | undefined;

  try {
    await lockSession`SELECT pg_advisory_lock(${notificationInsertLock.classId}, ${notificationInsertLock.objectId})`;
    lockHeld = true;
    await pg.unsafe(`
      CREATE FUNCTION block_notification_insert() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      BEGIN
        PERFORM pg_advisory_xact_lock(${notificationInsertLock.classId}, ${notificationInsertLock.objectId});
        RETURN NEW;
      END
      $function$;
      CREATE TRIGGER block_notification_insert
      BEFORE INSERT ON notification
      FOR EACH ROW EXECUTE FUNCTION block_notification_insert();
    `);
    notificationTriggerInstalled = true;

    notification = createNotification();
    await waitForNotificationInsertBlock();
    deletion = deleteSource();
    const deletionCompleted = await Promise.race([
      deletion.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_000)),
    ]);
    assert.equal(
      deletionCompleted,
      true,
      'Source delete unexpectedly waited for Notification insert',
    );
    await lockSession`SELECT pg_advisory_unlock(${notificationInsertLock.classId}, ${notificationInsertLock.objectId})`;
    lockHeld = false;
    await Promise.all([notification, deletion]);
  } finally {
    if (lockHeld) {
      await lockSession`SELECT pg_advisory_unlock(${notificationInsertLock.classId}, ${notificationInsertLock.objectId})`;
    }
    if (notification && deletion) {
      await Promise.allSettled([notification, deletion]);
    }
    if (notificationTriggerInstalled) {
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS block_notification_insert ON notification;
        DROP FUNCTION IF EXISTS block_notification_insert();
      `);
    }
    lockSession.release();
  }
};

const runReactionNotificationDeleteRace = async (sourceId: string): Promise<void> => {
  const lockSession = await pg.reserve();
  let lockHeld = false;
  let notificationTriggerInstalled = false;
  let notification: Promise<void> | undefined;

  try {
    await lockSession`SELECT pg_advisory_lock(${notificationInsertLock.classId}, ${notificationInsertLock.objectId})`;
    lockHeld = true;
    await pg.unsafe(`
      CREATE FUNCTION block_notification_insert() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      BEGIN
        PERFORM pg_advisory_xact_lock(${notificationInsertLock.classId}, ${notificationInsertLock.objectId});
        RETURN NEW;
      END
      $function$;
      CREATE TRIGGER block_notification_insert
      BEFORE INSERT ON notification
      FOR EACH ROW EXECUTE FUNCTION block_notification_insert();
    `);
    notificationTriggerInstalled = true;

    notification = createReactionNotification(sourceId);
    await waitForNotificationInsertBlock();

    // A plain source read must not hold the Reaction tuple while the
    // post-commit projection is waiting on its Notification insert.
    await db.delete(Reactions).where(eq(Reactions.id, sourceId));
    assert.equal(
      (await db.select({ id: Reactions.id }).from(Reactions).where(eq(Reactions.id, sourceId)))
        .length,
      0,
    );

    await lockSession`SELECT pg_advisory_unlock(${notificationInsertLock.classId}, ${notificationInsertLock.objectId})`;
    lockHeld = false;
    await notification;
  } finally {
    if (lockHeld) {
      await lockSession`SELECT pg_advisory_unlock(${notificationInsertLock.classId}, ${notificationInsertLock.objectId})`;
    }
    if (notification) {
      await Promise.allSettled([notification]);
    }
    if (notificationTriggerInstalled) {
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS block_notification_insert ON notification;
        DROP FUNCTION IF EXISTS block_notification_insert();
      `);
    }
    lockSession.release();
  }
};

after(async () => {
  if (profileIds.length > 0) {
    await db.delete(Notifications).where(inArray(Notifications.recipientProfileId, profileIds));
    await db.delete(Reactions).where(inArray(Reactions.profileId, profileIds));
    const postIds = await db
      .select({ id: Posts.id })
      .from(Posts)
      .where(inArray(Posts.profileId, profileIds))
      .then((rows) => rows.map(({ id }) => id));
    if (postIds.length > 0) {
      await db.update(Posts).set({ currentContentId: null }).where(inArray(Posts.id, postIds));
      await db.delete(PostContents).where(inArray(PostContents.postId, postIds));
    }
    await db.delete(Posts).where(inArray(Posts.profileId, profileIds));
    await db
      .delete(ProfileFollows)
      .where(
        or(
          inArray(ProfileFollows.followerProfileId, profileIds),
          inArray(ProfileFollows.followeeProfileId, profileIds),
        ),
      );
    await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
  }
  if (accountIds.length > 0) {
    await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
  }
  if (instanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, instanceIds));
  }
  await pg.end();
});

test('Follow 알림은 source에서 Local Recipient와 Related Profile을 파생한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  await createFollowNotification(profileFollow.id);

  const [notification] = await readNotifications(profileFollow.id);
  assert.ok(notification);
  assert.equal(notification.kind, NotificationKind.FOLLOW);
  assert.equal(notification.sourceId, profileFollow.id);
  assert.equal(notification.recipientProfileId, profileFollow.followeeProfileId);
  assert.equal(profileFollow.followerProfileId, follower.id);
  assert.deepEqual(notification.data, {});
  assert.equal(notification.readAt, null);
});

test('Follow 알림은 materialize된 Remote Follower도 같은 mapping으로 저장한다', async () => {
  const follower = await createProfile(InstanceKind.ACTIVITYPUB);
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  await createFollowNotification(profileFollow.id);

  const [notification] = await readNotifications(profileFollow.id);
  assert.equal(notification?.recipientProfileId, followee.id);
  assert.equal(profileFollow.followerProfileId, follower.id);
});

test('Follow 알림은 Remote Recipient source를 post-commit no-op으로 처리한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(InstanceKind.ACTIVITYPUB);
  const profileFollow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);

  await assert.doesNotReject(createFollowNotification(profileFollow.id));
  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Follow 알림은 존재하지 않거나 삭제된 source를 post-commit no-op으로 처리한다', async () => {
  const missingSourceId = crypto.randomUUID();
  await assert.doesNotReject(createFollowNotification(missingSourceId));
  assert.deepEqual(await readNotifications(missingSourceId), []);

  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });

  await assert.doesNotReject(createFollowNotification(profileFollow.id));
  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Follow 알림 생성과 삭제는 반복 및 동시 호출에 idempotent하다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );

  await Promise.all([
    createFollowNotification(profileFollow.id),
    createFollowNotification(profileFollow.id),
  ]);
  assert.equal((await readNotifications(profileFollow.id)).length, 1);

  await createFollowNotification(profileFollow.id);
  assert.equal((await readNotifications(profileFollow.id)).length, 1);

  await deleteNotificationBySource(NotificationKind.FOLLOW, profileFollow.id);
  await deleteNotificationBySource(NotificationKind.FOLLOW, profileFollow.id);
  assert.deepEqual(await readNotifications(profileFollow.id), []);
});

test('Follow Request 알림은 pending source에서 requester와 Local Recipient를 파생한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);

  await Promise.all([
    createFollowRequestNotification(request.id),
    createFollowRequestNotification(request.id),
  ]);

  const [notification] = await readNotifications(request.id);
  assert.ok(notification);
  assert.equal(notification.kind, NotificationKind.FOLLOW_REQUEST);
  assert.equal(notification.sourceId, request.id);
  assert.equal(notification.recipientProfileId, followee.id);
  assert.deepEqual(notification.data, {});
  assert.equal(notification.readAt, null);

  await deleteNotificationBySource(NotificationKind.FOLLOW_REQUEST, request.id);
  assert.deepEqual(await readNotifications(request.id), []);
});

test('Follow Request 알림은 Remote Recipient에 투영하지 않는다', async () => {
  const follower = await createProfile();
  const followee = await createProfile(InstanceKind.ACTIVITYPUB);
  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);

  await createFollowRequestNotification(request.id);
  assert.deepEqual(await readNotifications(request.id), []);
});

test('Follow·Follow Request 알림은 Recipient Mute와 양방향 Block을 반영한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);

  await db.insert(ProfileMutes).values({
    ownerProfileId: followee.id,
    targetProfileId: follower.id,
    expiresAt: null,
  });
  await createFollowNotification(profileFollow.id);
  await createFollowRequestNotification(request.id);
  assert.deepEqual(await readNotifications(profileFollow.id), []);
  assert.deepEqual(await readNotifications(request.id), []);

  await db.delete(ProfileMutes).where(eq(ProfileMutes.ownerProfileId, followee.id));
  await db.insert(ProfileBlocks).values({
    ownerProfileId: follower.id,
    targetProfileId: followee.id,
  });
  await createFollowNotification(profileFollow.id);
  await createFollowRequestNotification(request.id);
  assert.deepEqual(await readNotifications(profileFollow.id), []);
  assert.deepEqual(await readNotifications(request.id), []);

  await db.delete(ProfileBlocks).where(eq(ProfileBlocks.ownerProfileId, follower.id));
  await createFollowNotification(profileFollow.id);
  await createFollowRequestNotification(request.id);
  assert.equal((await readNotifications(profileFollow.id)).length, 1);
  assert.equal((await readNotifications(request.id)).length, 1);
});

test('다섯 source는 실제 정책 SELECT 실패를 전파하고 commit된 source를 보존한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  const followRequest = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);
  const replyParent = await createContentPost(followee.id);
  const reply = await createPost({
    document: postContentDocumentFromText('policy failure reply'),
    origin: 'LOCAL',
    profileId: follower.id,
    replyParentId: replyParent.id,
    visibility: PostVisibility.PUBLIC,
  }).then(({ post }) => post);
  const reaction = await createReaction(follower.id, followee.id);
  const repostSource = await createContentPost(followee.id);
  const { repost } = await repostPost({
    actorProfileId: follower.id,
    origin: 'LOCAL',
    sourcePostId: repostSource.id,
  });

  const cases = [
    {
      name: 'Follow',
      kind: NotificationKind.FOLLOW,
      id: profileFollow.id,
      create: () => createFollowNotification(profileFollow.id),
      assertSource: async () =>
        assert.equal(await db.$count(ProfileFollows, eq(ProfileFollows.id, profileFollow.id)), 1),
    },
    {
      name: 'Follow Request',
      kind: NotificationKind.FOLLOW_REQUEST,
      id: followRequest.id,
      create: () => createFollowRequestNotification(followRequest.id),
      assertSource: async () =>
        assert.equal(
          await db.$count(ProfileFollowRequests, eq(ProfileFollowRequests.id, followRequest.id)),
          1,
        ),
    },
    {
      name: 'Reply',
      kind: NotificationKind.REPLY,
      id: reply.id,
      create: () => createReplyNotification(reply.id),
      assertSource: async () => assert.equal(await db.$count(Posts, eq(Posts.id, reply.id)), 1),
    },
    {
      name: 'Reaction',
      kind: NotificationKind.REACTION,
      id: reaction.id,
      create: () => createReactionNotification(reaction.id),
      assertSource: async () =>
        assert.equal(await db.$count(Reactions, eq(Reactions.id, reaction.id)), 1),
    },
    {
      name: 'Repost',
      kind: NotificationKind.REPOST,
      id: repost.id,
      create: () => createRepostNotification(repost.id),
      assertSource: async () => assert.equal(await db.$count(Posts, eq(Posts.id, repost.id)), 1),
    },
  ] as const;

  await pg.unsafe('ALTER TABLE profile_block RENAME TO profile_block_policy_failure');
  try {
    for (const source of cases) {
      await assert.rejects(
        source.create(),
        (error: unknown) => {
          assert.match(String(error), /profile_block/);
          return true;
        },
        `${source.name} policy SELECT failure should propagate`,
      );
      await source.assertSource();
      assert.deepEqual(await readNotifications(source.id), []);
    }
  } finally {
    await pg.unsafe('ALTER TABLE profile_block_policy_failure RENAME TO profile_block');
  }

  for (const source of cases) {
    await source.create();
    const notifications = await readNotifications(source.id);
    assert.equal(
      notifications.length,
      1,
      `${source.name} policy should be reevaluated after recovery`,
    );
    assert.equal(notifications[0]?.kind, source.kind);
    assert.equal(notifications[0]?.recipientProfileId, followee.id);
  }

  const mutePolicyFailureReaction = await createReaction(follower.id, followee.id);
  await pg.unsafe('ALTER TABLE profile_mute RENAME TO profile_mute_policy_failure');
  try {
    await assert.rejects(
      createReactionNotification(mutePolicyFailureReaction.id),
      (error: unknown) => {
        assert.match(String(error), /profile_mute/);
        return true;
      },
      'Reaction mute policy SELECT failure should propagate',
    );
    assert.equal(await db.$count(Reactions, eq(Reactions.id, mutePolicyFailureReaction.id)), 1);
    assert.deepEqual(await readNotifications(mutePolicyFailureReaction.id), []);
  } finally {
    await pg.unsafe('ALTER TABLE profile_mute_policy_failure RENAME TO profile_mute');
  }

  await createReactionNotification(mutePolicyFailureReaction.id);
  assert.equal((await readNotifications(mutePolicyFailureReaction.id)).length, 1);
});

test('같은 Account의 A1만 적용한 Mute는 A2 Recipient를 격리한다', async () => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: crypto.randomUUID(),
      oidcSubject: crypto.randomUUID(),
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  accountIds.push(account.id);
  const [recipientA1, recipientA2, related] = await Promise.all([
    createProfile(),
    createProfile(),
    createProfile(),
  ]);
  await db.insert(AccountProfiles).values([
    { accountId: account.id, profileId: recipientA1.id, role: AccountProfileRole.OWNER },
    { accountId: account.id, profileId: recipientA2.id, role: AccountProfileRole.MEMBER },
  ]);
  const followA1 = getEstablishedFollow(
    await followProfile({
      followerProfileId: related.id,
      followeeProfileId: recipientA1.id,
    }),
  );
  const followA2 = getEstablishedFollow(
    await followProfile({
      followerProfileId: related.id,
      followeeProfileId: recipientA2.id,
    }),
  );

  await muteProfile({ ownerProfileId: recipientA1.id, targetProfileId: related.id });
  await createFollowNotification(followA1.id);
  await createFollowNotification(followA2.id);

  assert.deepEqual(await readNotifications(followA1.id), []);
  const [a2Notification] = await readNotifications(followA2.id);
  assert.ok(a2Notification);
  assert.equal(a2Notification.recipientProfileId, recipientA2.id);
  assert.equal(a2Notification.sourceId, followA2.id);
});

test('Mute·mutual Block 관계 변경은 해제 후 새 source를 재평가한다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const mute = await muteProfile({
    ownerProfileId: recipient.id,
    targetProfileId: author.id,
  });
  await unmuteProfile({ ownerProfileId: recipient.id, profileMuteId: mute.id });

  const unmutedReaction = await createReaction(author.id, recipient.id);
  await createReactionNotification(unmutedReaction.id);
  assert.equal((await readNotifications(unmutedReaction.id)).length, 1);

  const blockedReaction = await createReaction(author.id, recipient.id);
  await db.insert(ProfileBlocks).values([
    { ownerProfileId: recipient.id, targetProfileId: author.id },
    { ownerProfileId: author.id, targetProfileId: recipient.id },
  ]);
  await createReactionNotification(blockedReaction.id);
  assert.deepEqual(await readNotifications(blockedReaction.id), []);

  await db
    .delete(ProfileBlocks)
    .where(
      and(
        eq(ProfileBlocks.ownerProfileId, recipient.id),
        eq(ProfileBlocks.targetProfileId, author.id),
      ),
    );
  await createReactionNotification(blockedReaction.id);
  assert.deepEqual(await readNotifications(blockedReaction.id), []);

  await db
    .delete(ProfileBlocks)
    .where(
      and(
        eq(ProfileBlocks.ownerProfileId, author.id),
        eq(ProfileBlocks.targetProfileId, recipient.id),
      ),
    );
  const releasedReaction = await createReaction(author.id, recipient.id);
  await createReactionNotification(releasedReaction.id);
  assert.equal((await readNotifications(releasedReaction.id)).length, 1);
  assert.deepEqual(await readNotifications(blockedReaction.id), []);
});

test('Follow Notification create/delete race does not lock the source row', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const profileFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  await deleteNotificationBySource(NotificationKind.FOLLOW, profileFollow.id);

  await runNotificationDeleteRace(
    () => createFollowNotification(profileFollow.id),
    () =>
      unfollowProfile({
        followerProfileId: follower.id,
        followeeProfileId: followee.id,
      }),
  );
  assert.deepEqual(
    await db
      .select({ id: Notifications.id })
      .from(Notifications)
      .innerJoin(ProfileFollows, eq(ProfileFollows.id, Notifications.sourceId))
      .where(
        and(
          eq(Notifications.kind, NotificationKind.FOLLOW),
          eq(Notifications.sourceId, profileFollow.id),
        ),
      ),
    [],
  );

  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);
  await runNotificationDeleteRace(
    () => createFollowRequestNotification(request.id),
    () =>
      removeInboundFollow({
        expectedRowId: request.id,
        followeeProfileId: followee.id,
        followerProfileId: follower.id,
      }),
  );
  assert.deepEqual(
    await db
      .select({ id: Notifications.id })
      .from(Notifications)
      .innerJoin(ProfileFollowRequests, eq(ProfileFollowRequests.id, Notifications.sourceId))
      .where(
        and(
          eq(Notifications.kind, NotificationKind.FOLLOW_REQUEST),
          eq(Notifications.sourceId, request.id),
        ),
      ),
    [],
  );
});

test('Reaction Notification source row lock 없이 source 삭제와 경합한다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const reaction = await createReaction(author.id, recipient.id);

  await runReactionNotificationDeleteRace(reaction.id);

  // The source row is gone. Depending on the exact interleaving the
  // best-effort insert may have committed after the source delete; the API
  // source visibility predicate hides such an unavailable Notification.
  assert.equal(
    (await db.select({ id: Reactions.id }).from(Reactions).where(eq(Reactions.id, reaction.id)))
      .length,
    0,
  );
});

test('Follow Request 알림 create 실패는 Activity retry를 위해 호출자에게 전파된다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);
  await db.execute(
    sql`ALTER TABLE ${Notifications} ADD CONSTRAINT notification_follow_request_create_failure CHECK (false) NOT VALID`,
  );
  try {
    await assert.rejects(createFollowRequestNotification(request.id));
  } finally {
    await db.execute(
      sql`ALTER TABLE ${Notifications} DROP CONSTRAINT notification_follow_request_create_failure`,
    );
  }

  assert.equal(
    (await db.select().from(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, request.id)))
      .length,
    1,
  );
});

test('Follow Request 알림 delete 실패는 Activity retry를 위해 호출자에게 전파된다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);
  await db.insert(Notifications).values({
    data: {},
    kind: NotificationKind.FOLLOW_REQUEST,
    recipientProfileId: followee.id,
    sourceId: request.id,
  });
  await db.execute(sql`
    CREATE FUNCTION fail_follow_request_notification_delete() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'follow request notification delete failed';
    END;
    $$
  `);
  await db.execute(sql`
    CREATE TRIGGER notification_follow_request_delete_failure
    BEFORE DELETE ON ${Notifications}
    FOR EACH ROW EXECUTE FUNCTION fail_follow_request_notification_delete()
  `);
  try {
    await assert.rejects(deleteFollowRequestNotification(request.id));
  } finally {
    await db.execute(
      sql`DROP TRIGGER notification_follow_request_delete_failure ON ${Notifications}`,
    );
    await db.execute(sql`DROP FUNCTION fail_follow_request_notification_delete()`);
  }

  assert.equal((await readNotifications(request.id)).length, 1);
});

test('Unfollow 뒤 Re-follow는 새 source ID로 새 알림을 저장한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const firstFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  const deleted = await unfollowProfile({
    followerProfileId: follower.id,
    followeeProfileId: followee.id,
  });
  assert.equal(deleted.profileFollowId, firstFollow.id);

  const secondFollow = getEstablishedFollow(
    await followProfile({
      followerProfileId: follower.id,
      followeeProfileId: followee.id,
    }),
  );
  await createFollowNotification(secondFollow.id);
  assert.notEqual(secondFollow.id, firstFollow.id);
  assert.deepEqual(await readNotifications(firstFollow.id), []);
  assert.equal((await readNotifications(secondFollow.id)).length, 1);
});

test('Reaction 알림은 source에서 Recipient와 Related 객체를 파생하고 idempotent하다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const reaction = await createReaction(author.id, recipient.id);

  await Promise.all([
    createReactionNotification(reaction.id),
    createReactionNotification(reaction.id),
  ]);

  const [notification] = await readNotifications(reaction.id);
  assert.ok(notification);
  assert.equal(notification.kind, NotificationKind.REACTION);
  assert.equal(notification.recipientProfileId, recipient.id);
  assert.equal(notification.sourceId, reaction.id);
  assert.deepEqual(notification.data, {});
});

test('Reaction 알림은 자기 Post와 Remote Recipient에서 no-op이다', async () => {
  const self = await createProfile();
  const selfReaction = await createReaction(self.id, self.id);
  await createReactionNotification(selfReaction.id);
  assert.deepEqual(await readNotifications(selfReaction.id), []);

  const author = await createProfile();
  const remoteRecipient = await createProfile(InstanceKind.ACTIVITYPUB);
  const remoteReaction = await createReaction(author.id, remoteRecipient.id);
  await createReactionNotification(remoteReaction.id);
  assert.deepEqual(await readNotifications(remoteReaction.id), []);
});

test('Reaction 알림은 존재하지 않는 source를 post-commit no-op으로 처리한다', async () => {
  const sourceId = crypto.randomUUID();
  await assert.doesNotReject(createReactionNotification(sourceId));
  assert.deepEqual(await readNotifications(sourceId), []);
});

test('다섯 source의 Notification Mute는 DB 현재 시각으로 활성 여부를 판정한다', async () => {
  const sources = await Promise.all(
    Array.from({ length: 5 }, async (_, index) => {
      const author = await createProfile();
      const recipient = await createProfile();

      if (index === 0) {
        const profileFollow = getEstablishedFollow(
          await followProfile({
            followerProfileId: author.id,
            followeeProfileId: recipient.id,
          }),
        );
        return {
          name: 'Follow',
          kind: NotificationKind.FOLLOW,
          relatedProfileId: author.id,
          recipientProfileId: recipient.id,
          sourceId: profileFollow.id,
          create: () => createFollowNotification(profileFollow.id),
        };
      }

      if (index === 1) {
        const request = await db
          .insert(ProfileFollowRequests)
          .values({ followerProfileId: author.id, followeeProfileId: recipient.id })
          .returning()
          .then(firstOrThrow);
        return {
          name: 'Follow Request',
          kind: NotificationKind.FOLLOW_REQUEST,
          relatedProfileId: author.id,
          recipientProfileId: recipient.id,
          sourceId: request.id,
          create: () => createFollowRequestNotification(request.id),
        };
      }

      if (index === 2) {
        const parent = await createContentPost(recipient.id);
        const reply = await createPost({
          document: postContentDocumentFromText(`mute policy reply ${crypto.randomUUID()}`),
          origin: 'LOCAL',
          profileId: author.id,
          replyParentId: parent.id,
          visibility: PostVisibility.PUBLIC,
        }).then(({ post }) => post);
        return {
          name: 'Reply',
          kind: NotificationKind.REPLY,
          relatedProfileId: author.id,
          recipientProfileId: recipient.id,
          sourceId: reply.id,
          create: () => createReplyNotification(reply.id),
        };
      }

      if (index === 3) {
        const reaction = await createReaction(author.id, recipient.id);
        return {
          name: 'Reaction',
          kind: NotificationKind.REACTION,
          relatedProfileId: author.id,
          recipientProfileId: recipient.id,
          sourceId: reaction.id,
          create: () => createReactionNotification(reaction.id),
        };
      }

      const sourcePost = await createContentPost(recipient.id);
      const { repost } = await repostPost({
        actorProfileId: author.id,
        origin: 'LOCAL',
        sourcePostId: sourcePost.id,
      });
      return {
        name: 'Repost',
        kind: NotificationKind.REPOST,
        relatedProfileId: author.id,
        recipientProfileId: recipient.id,
        sourceId: repost.id,
        create: () => createRepostNotification(repost.id),
      };
    }),
  );

  for (const source of sources) {
    const setMute = async (expiresAt: Temporal.Instant | null) => {
      await db
        .insert(ProfileMutes)
        .values({
          ownerProfileId: source.recipientProfileId,
          targetProfileId: source.relatedProfileId,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [ProfileMutes.ownerProfileId, ProfileMutes.targetProfileId],
          set: { expiresAt },
        });
    };

    const assertNotificationCount = async (expected: number, state: string) => {
      assert.equal(
        (await readNotifications(source.sourceId)).length,
        expected,
        `${source.name} ${state} Mute notification count`,
      );
      await deleteNotificationBySource(source.kind, source.sourceId);
    };

    await source.create();
    await assertNotificationCount(1, 'without');

    await setMute(null);
    await source.create();
    await assertNotificationCount(0, 'NULL');

    await setMute(Temporal.Instant.from('2099-01-01T00:00:00Z'));
    await source.create();
    await assertNotificationCount(0, 'future');

    await setMute(Temporal.Instant.from('2000-01-01T00:00:00Z'));
    await source.create();
    await assertNotificationCount(1, 'past');

    await db
      .insert(ProfileMutes)
      .values({
        ownerProfileId: source.relatedProfileId,
        targetProfileId: source.recipientProfileId,
        expiresAt: null,
      })
      .onConflictDoUpdate({
        target: [ProfileMutes.ownerProfileId, ProfileMutes.targetProfileId],
        set: { expiresAt: null },
      });
    await source.create();
    await assertNotificationCount(1, 'reverse');
    await db
      .delete(ProfileMutes)
      .where(
        and(
          eq(ProfileMutes.ownerProfileId, source.relatedProfileId),
          eq(ProfileMutes.targetProfileId, source.recipientProfileId),
        ),
      );

    await db.transaction(async (tx) => {
      const [{ current }] = await tx.execute<{ current: string }>(
        sql`SELECT CURRENT_TIMESTAMP AS current`,
      );
      await tx
        .update(ProfileMutes)
        .set({ expiresAt: Temporal.Instant.from(current) })
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, source.recipientProfileId),
            eq(ProfileMutes.targetProfileId, source.relatedProfileId),
          ),
        );
      await materializeNotification(tx, {
        kind: source.kind,
        recipientProfileId: source.recipientProfileId,
        relatedProfileId: source.relatedProfileId,
        sourceId: source.sourceId,
      });
    });
    await assertNotificationCount(1, 'exact boundary');

    await db
      .delete(ProfileMutes)
      .where(
        and(
          eq(ProfileMutes.ownerProfileId, source.recipientProfileId),
          eq(ProfileMutes.targetProfileId, source.relatedProfileId),
        ),
      );
  }
});

test('Repost 알림은 direct Source에서 Recipient와 Related 객체를 파생하고 idempotent하다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const original = await createContentPost(recipient.id);
  const reply = await createContentPost(recipient.id);
  await db.update(Posts).set({ replyParentId: original.id }).where(eq(Posts.id, reply.id));
  const quote = await createContentPost(recipient.id);
  await db.update(Posts).set({ repostSourceId: original.id }).where(eq(Posts.id, quote.id));

  for (const relatedPost of [original, reply, quote]) {
    const { repost } = await repostPost({
      actorProfileId: author.id,
      origin: 'LOCAL',
      sourcePostId: relatedPost.id,
    });

    await Promise.all([createRepostNotification(repost.id), createRepostNotification(repost.id)]);

    const [notification] = await readNotifications(repost.id);
    assert.ok(notification);
    assert.equal(notification.kind, NotificationKind.REPOST);
    assert.equal(notification.recipientProfileId, recipient.id);
    assert.equal(notification.sourceId, repost.id);
    assert.equal(repost.profileId, author.id);
    assert.equal(repost.repostSourceId, relatedPost.id);
    assert.deepEqual(notification.data, {});
  }
});

test('Repost 알림은 자기 Post와 Remote Recipient에서 no-op이다', async () => {
  const self = await createProfile();
  const selfSource = await createContentPost(self.id);
  const { repost: selfRepost } = await repostPost({
    actorProfileId: self.id,
    origin: 'LOCAL',
    sourcePostId: selfSource.id,
  });
  await createRepostNotification(selfRepost.id);
  assert.deepEqual(await readNotifications(selfRepost.id), []);

  const author = await createProfile();
  const remoteRecipient = await createProfile(InstanceKind.ACTIVITYPUB);
  const remoteSource = await createContentPost(remoteRecipient.id);
  const { repost: remoteRepost } = await repostPost({
    actorProfileId: author.id,
    origin: 'LOCAL',
    sourcePostId: remoteSource.id,
  });
  await createRepostNotification(remoteRepost.id);
  assert.deepEqual(await readNotifications(remoteRepost.id), []);
});

test('Repost 알림은 존재하지 않거나 pure Repost가 아닌 source에서 no-op이다', async () => {
  const notificationCount = await db.$count(Notifications);
  await assert.doesNotReject(createRepostNotification(crypto.randomUUID()));

  const author = await createProfile();
  const contentPost = await createContentPost(author.id);
  await assert.doesNotReject(createRepostNotification(contentPost.id));
  assert.equal(await db.$count(Notifications), notificationCount);
});

test('Repost 알림은 Recipient Mute와 양방향 Block이 있으면 생성하지 않는다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const source = await createContentPost(recipient.id);
  const { repost } = await repostPost({
    actorProfileId: author.id,
    origin: 'LOCAL',
    sourcePostId: source.id,
  });

  await db.insert(ProfileMutes).values({
    ownerProfileId: recipient.id,
    targetProfileId: author.id,
    expiresAt: null,
  });
  await createRepostNotification(repost.id);
  assert.deepEqual(await readNotifications(repost.id), []);

  await db.delete(ProfileMutes).where(eq(ProfileMutes.ownerProfileId, recipient.id));
  await db.insert(ProfileBlocks).values({
    ownerProfileId: recipient.id,
    targetProfileId: author.id,
  });
  await createRepostNotification(repost.id);
  assert.deepEqual(await readNotifications(repost.id), []);

  await db.delete(ProfileBlocks).where(eq(ProfileBlocks.ownerProfileId, recipient.id));
  await createRepostNotification(repost.id);
  assert.equal((await readNotifications(repost.id)).length, 1);
});

test('Repost 알림 정리는 정상·반복·없는 source에 idempotent하다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const source = await createContentPost(recipient.id);
  const { repost } = await repostPost({
    actorProfileId: author.id,
    origin: 'LOCAL',
    sourcePostId: source.id,
  });

  await createRepostNotification(repost.id);
  await deleteNotificationBySource(NotificationKind.REPOST, repost.id);
  await deleteNotificationBySource(NotificationKind.REPOST, repost.id);
  assert.deepEqual(await readNotifications(repost.id), []);

  await deleteNotificationBySource(NotificationKind.REPOST, crypto.randomUUID());
});

test('Reaction 알림 정리는 정상·반복·없는 source에 idempotent하다', async () => {
  const author = await createProfile();
  const recipient = await createProfile();
  const reaction = await createReaction(author.id, recipient.id);

  await createReactionNotification(reaction.id);
  await deleteNotificationBySource(NotificationKind.REACTION, reaction.id);
  await deleteNotificationBySource(NotificationKind.REACTION, reaction.id);
  assert.deepEqual(await readNotifications(reaction.id), []);

  const staleReaction = await createReaction(author.id, recipient.id);
  await createReactionNotification(staleReaction.id);
  await db.delete(Reactions).where(eq(Reactions.id, staleReaction.id));
  await deleteNotificationBySource(NotificationKind.REACTION, staleReaction.id);
  assert.deepEqual(await readNotifications(staleReaction.id), []);

  await deleteNotificationBySource(NotificationKind.REACTION, crypto.randomUUID());
});
