import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { eq, inArray, or, sql } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  Notifications,
  pg,
  PostContents,
  Posts,
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
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import {
  createFollowNotification,
  createFollowRequestNotification,
  createFollowRequestNotificationPostCommit,
  createReactionNotification,
  createRepostNotification,
  deleteFollowRequestNotificationPostCommit,
  deleteNotificationBySource,
  setNotificationEffectErrorReporter,
} from './notification';
import { createPost, repostPost } from './post';
import { followProfile, removeInboundFollow, unfollowProfile } from './profile-follow';
import { deleteReaction } from './reaction';

const instanceIds: string[] = [];
const profileIds: string[] = [];

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

type NotificationSourceTable = 'profile_follow' | 'profile_follow_request' | 'reaction';

const waitForSourceDeleteBlock = async (table: NotificationSourceTable): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [activity] = await pg<{ waiting: number }[]>`
      SELECT count(*)::integer AS waiting
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND wait_event IN ('transactionid', 'tuple')
        AND query ILIKE ${`%delete from "${table}"%`}
    `;
    if ((activity?.waiting ?? 0) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail(`Source delete did not reach the ${table} row lock barrier`);
};

const runNotificationDeleteRace = async (
  sourceTable: NotificationSourceTable,
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
    await waitForSourceDeleteBlock(sourceTable);
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
  await unfollowProfile({ followerProfileId: follower.id, followeeProfileId: followee.id });

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

test('Notification source lock prevents orphan rows across terminal source deletion', async () => {
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
    'profile_follow',
    () => createFollowNotification(profileFollow.id),
    () => unfollowProfile({ followerProfileId: follower.id, followeeProfileId: followee.id }),
  );
  assert.deepEqual(await readNotifications(profileFollow.id), []);

  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);
  await runNotificationDeleteRace(
    'profile_follow_request',
    () => createFollowRequestNotification(request.id),
    () =>
      removeInboundFollow({
        expectedRowId: request.id,
        followeeProfileId: followee.id,
        followerProfileId: follower.id,
      }),
  );
  assert.deepEqual(await readNotifications(request.id), []);

  const author = await createProfile();
  const reaction = await createReaction(author.id, followee.id);
  await runNotificationDeleteRace(
    'reaction',
    () => createReactionNotification(reaction.id),
    async () => {
      const deleted = await deleteReaction({
        actorProfileId: reaction.profileId,
        origin: 'ACTIVITYPUB',
        postId: reaction.postId,
        type: reaction.type,
      });
      await deleted.postCommit();
    },
  );
  assert.deepEqual(await readNotifications(reaction.id), []);
});

test('Follow Request 알림 create 실패는 source lifecycle과 최소 context 보고를 분리한다', async () => {
  const follower = await createProfile();
  const followee = await createProfile();
  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: follower.id, followeeProfileId: followee.id })
    .returning()
    .then(firstOrThrow);
  const reporter = mock.fn();
  const restoreReporter = setNotificationEffectErrorReporter(reporter);

  await db.execute(
    sql`ALTER TABLE ${Notifications} ADD CONSTRAINT notification_follow_request_create_failure CHECK (false) NOT VALID`,
  );
  try {
    await createFollowRequestNotificationPostCommit(request.id);
  } finally {
    await db.execute(
      sql`ALTER TABLE ${Notifications} DROP CONSTRAINT notification_follow_request_create_failure`,
    );
    restoreReporter();
  }

  assert.equal(
    (await db.select().from(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, request.id)))
      .length,
    1,
  );
  assert.equal(reporter.mock.calls.length, 1);
  assert.deepEqual(reporter.mock.calls[0]?.arguments[1], {
    notificationKind: NotificationKind.FOLLOW_REQUEST,
    operation: 'create',
    sourceId: request.id,
  });
});

test('Follow Request 알림 delete 실패는 source lifecycle과 최소 context 보고를 분리한다', async () => {
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
  const reporter = mock.fn();
  const restoreReporter = setNotificationEffectErrorReporter(reporter);

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
    await deleteFollowRequestNotificationPostCommit(request.id);
  } finally {
    await db.execute(
      sql`DROP TRIGGER notification_follow_request_delete_failure ON ${Notifications}`,
    );
    await db.execute(sql`DROP FUNCTION fail_follow_request_notification_delete()`);
    restoreReporter();
  }

  assert.equal((await readNotifications(request.id)).length, 1);
  assert.equal(reporter.mock.calls.length, 1);
  assert.deepEqual(reporter.mock.calls[0]?.arguments[1], {
    notificationKind: NotificationKind.FOLLOW_REQUEST,
    operation: 'delete',
    sourceId: request.id,
  });
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
