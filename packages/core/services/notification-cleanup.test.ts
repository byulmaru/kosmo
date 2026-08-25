import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
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
  ProfileState,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import {
  cleanupUnavailableNotificationsPage,
  getNotificationCleanupUpperBound,
  NotificationCleanupInputError,
} from './notification-cleanup';

const instanceIds: string[] = [];
const profileIds: string[] = [];
const notificationIds: string[] = [];
const postContentIds: string[] = [];
const postIds: string[] = [];
const profileFollowRequestIds: string[] = [];
const profileFollowIds: string[] = [];
const reactionIds: string[] = [];

beforeEach(async () => {
  // This service intentionally scans the global Notification keyspace. Keep
  // each fixture independent from Notification rows left by earlier service
  // test files and by the preceding case in this file.
  await db.delete(Notifications);
});

const createProfile = async ({
  kind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
  state = ProfileState.ACTIVE,
}: {
  readonly kind?: InstanceKind;
  readonly instanceState?: InstanceState;
  readonly state?: ProfileState;
} = {}) => {
  const suffix = `cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind,
      state: instanceState,
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
      state,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);
  return profile;
};

const createFollow = async (followerProfileId: string, followeeProfileId: string) => {
  const follow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId, followeeProfileId })
    .returning()
    .then(firstOrThrow);
  profileFollowIds.push(follow.id);
  return follow;
};

const createFollowRequest = async (followerProfileId: string, followeeProfileId: string) => {
  const request = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId, followeeProfileId })
    .returning()
    .then(firstOrThrow);
  profileFollowRequestIds.push(request.id);
  return request;
};

const createPost = async ({
  profileId,
  replyParentId = null,
  repostSourceId = null,
  withContent = true,
}: {
  readonly profileId: string;
  readonly replyParentId?: string | null;
  readonly repostSourceId?: string | null;
  readonly withContent?: boolean;
}) => {
  const post = await db
    .insert(Posts)
    .values({
      profileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
      replyParentId,
      repostSourceId,
      currentContentId: null,
    })
    .returning()
    .then(firstOrThrow);
  postIds.push(post.id);

  if (!withContent) {
    return post;
  }

  const content = await db
    .insert(PostContents)
    .values({ postId: post.id, document: postContentDocumentFromText('cleanup fixture') })
    .returning()
    .then(firstOrThrow);
  postContentIds.push(content.id);

  const [updatedPost] = await db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning();
  return updatedPost ?? post;
};

const createReaction = async (profileId: string, postId: string) => {
  const reaction = await db
    .insert(Reactions)
    .values({ profileId, postId, type: '❤️' })
    .returning()
    .then(firstOrThrow);
  reactionIds.push(reaction.id);
  return reaction;
};

const createNotification = async ({
  id = undefined,
  kind = NotificationKind.FOLLOW,
  recipientProfileId,
  sourceId = crypto.randomUUID(),
}: {
  readonly id?: string;
  readonly kind?: NotificationKind;
  readonly recipientProfileId: string;
  readonly sourceId?: string;
}) => {
  const notification = await db
    .insert(Notifications)
    .values({ id, data: {}, kind, recipientProfileId, sourceId })
    .returning()
    .then(firstOrThrow);
  notificationIds.push(notification.id);
  return notification;
};

after(async () => {
  if (notificationIds.length > 0) {
    await db.delete(Notifications).where(inArray(Notifications.id, notificationIds));
  }
  if (profileFollowIds.length > 0) {
    await db.delete(ProfileFollows).where(inArray(ProfileFollows.id, profileFollowIds));
  }
  if (profileFollowRequestIds.length > 0) {
    await db
      .delete(ProfileFollowRequests)
      .where(inArray(ProfileFollowRequests.id, profileFollowRequestIds));
  }
  if (reactionIds.length > 0) {
    await db.delete(Reactions).where(inArray(Reactions.id, reactionIds));
  }
  if (postIds.length > 0) {
    await db
      .update(Posts)
      .set({ currentContentId: null, repostSourceId: null, replyParentId: null })
      .where(inArray(Posts.id, postIds));
  }
  if (postContentIds.length > 0) {
    await db.delete(PostContents).where(inArray(PostContents.id, postContentIds));
  }
  if (postIds.length > 0) {
    await db.delete(Posts).where(inArray(Posts.id, postIds));
  }
  if (profileIds.length > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
  }
  if (instanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, instanceIds));
  }
  await pg.end();
});

test('empty cleanup captures a null upper bound separately and an explicit bound page completes', async () => {
  assert.equal(await getNotificationCleanupUpperBound(), null);
  const upperBound = crypto.randomUUID();
  const result = await cleanupUnavailableNotificationsPage({
    cursor: null,
    upperBound,
    pageSize: 10,
  });

  assert.equal(result.done, true);
  assert.equal(result.upperBound, upperBound);
  assert.equal(result.nextCursor, null);
  assert.deepEqual(
    {
      scanned: result.scanned,
      deleted: result.deleted,
      skipped: result.skipped,
    },
    { scanned: 0, deleted: 0, skipped: 0 },
  );
});

test('cleanup deletes missing/mismatched/hidden sources but preserves available and inactive recipients', async () => {
  const follower = await createProfile();
  const recipient = await createProfile();
  const mismatchRecipient = await createProfile();
  const inactiveRecipient = await createProfile({ state: ProfileState.DISABLED });
  const suspendedRecipient = await createProfile({ instanceState: InstanceState.SUSPENDED });
  const hiddenFollower = await createProfile({ state: ProfileState.DISABLED });
  const follow = await createFollow(follower.id, recipient.id);
  const inactiveFollow = await createFollow(follower.id, inactiveRecipient.id);
  const suspendedFollow = await createFollow(follower.id, suspendedRecipient.id);
  const hiddenFollow = await createFollow(hiddenFollower.id, recipient.id);

  const available = await createNotification({
    recipientProfileId: recipient.id,
    sourceId: follow.id,
  });
  const missingSource = await createNotification({ recipientProfileId: recipient.id });
  const mismatch = await createNotification({
    recipientProfileId: mismatchRecipient.id,
    sourceId: follow.id,
  });
  const inactive = await createNotification({
    recipientProfileId: inactiveRecipient.id,
    sourceId: inactiveFollow.id,
  });
  const suspended = await createNotification({
    recipientProfileId: suspendedRecipient.id,
    sourceId: suspendedFollow.id,
  });
  const hidden = await createNotification({
    recipientProfileId: recipient.id,
    sourceId: hiddenFollow.id,
  });

  const upperBound = await getNotificationCleanupUpperBound();
  assert.ok(upperBound);
  const result = await cleanupUnavailableNotificationsPage({
    cursor: null,
    upperBound,
    pageSize: 20,
  });

  assert.equal(result.done, true);
  assert.equal(result.deleted, 3);
  assert.equal(result.skipped, 3);
  const remaining = await db
    .select({ id: Notifications.id })
    .from(Notifications)
    .where(
      inArray(Notifications.id, [
        available.id,
        missingSource.id,
        mismatch.id,
        inactive.id,
        suspended.id,
        hidden.id,
      ]),
    );
  assert.deepEqual(
    remaining.map(({ id }) => id).sort(),
    [available.id, inactive.id, suspended.id].sort(),
  );
});

test('exclusive cursor and fixed upper bound leave later rows for the next sweep', async () => {
  const recipient = await createProfile();
  const first = await createNotification({ recipientProfileId: recipient.id });
  const second = await createNotification({ recipientProfileId: recipient.id });
  const third = await createNotification({ recipientProfileId: recipient.id });
  const upperBound = await getNotificationCleanupUpperBound();
  assert.ok(upperBound);

  const firstPage = await cleanupUnavailableNotificationsPage({
    cursor: null,
    upperBound,
    pageSize: 2,
  });
  assert.equal(firstPage.scanned, 2);
  assert.equal(firstPage.deleted, 2);
  assert.equal(firstPage.done, false);
  assert.equal(firstPage.nextCursor, second.id);

  const later = await createNotification({
    id: uuidv7({ msecs: Date.now() + 60_000 }),
    recipientProfileId: recipient.id,
  });
  const secondPage = await cleanupUnavailableNotificationsPage({
    cursor: firstPage.nextCursor,
    upperBound: firstPage.upperBound,
    pageSize: 2,
  });
  assert.equal(secondPage.deleted, 1);
  assert.equal(secondPage.done, true);
  assert.equal(secondPage.nextCursor, null);

  assert.equal(
    await db.$count(Notifications, and(inArray(Notifications.id, [first.id, second.id, third.id]))),
    0,
  );
  assert.equal(await db.$count(Notifications, eq(Notifications.id, later.id)), 1);
});

test('cleanup evaluates every source kind while preserving valid source projections', async () => {
  const recipient = await createProfile();
  const actor = await createProfile();
  const follow = await createFollow(actor.id, recipient.id);
  const followRequest = await createFollowRequest(actor.id, recipient.id);
  const reactionTarget = await createPost({ profileId: recipient.id });
  const reaction = await createReaction(actor.id, reactionTarget.id);
  const repostSource = await createPost({ profileId: recipient.id });
  const repost = await createPost({
    profileId: actor.id,
    repostSourceId: repostSource.id,
    withContent: false,
  });
  const replyParent = await createPost({ profileId: recipient.id });
  const reply = await createPost({ profileId: actor.id, replyParentId: replyParent.id });

  const available = await Promise.all([
    createNotification({
      kind: NotificationKind.FOLLOW,
      recipientProfileId: recipient.id,
      sourceId: follow.id,
    }),
    createNotification({
      kind: NotificationKind.FOLLOW_REQUEST,
      recipientProfileId: recipient.id,
      sourceId: followRequest.id,
    }),
    createNotification({
      kind: NotificationKind.REACTION,
      recipientProfileId: recipient.id,
      sourceId: reaction.id,
    }),
    createNotification({
      kind: NotificationKind.REPOST,
      recipientProfileId: recipient.id,
      sourceId: repost.id,
    }),
    createNotification({
      kind: NotificationKind.REPLY,
      recipientProfileId: recipient.id,
      sourceId: reply.id,
    }),
  ]);
  const unavailable = await Promise.all(
    [
      NotificationKind.FOLLOW,
      NotificationKind.FOLLOW_REQUEST,
      NotificationKind.REACTION,
      NotificationKind.REPOST,
      NotificationKind.REPLY,
    ].map((kind) => createNotification({ kind, recipientProfileId: recipient.id })),
  );

  const upperBound = await getNotificationCleanupUpperBound();
  assert.ok(upperBound);
  const result = await cleanupUnavailableNotificationsPage({
    cursor: null,
    upperBound,
    pageSize: 20,
  });

  assert.equal(result.done, true);
  assert.equal(result.deleted, unavailable.length);
  assert.equal(result.skipped, available.length);
  const remaining = await db
    .select({ id: Notifications.id })
    .from(Notifications)
    .where(
      inArray(
        Notifications.id,
        [...available, ...unavailable].map(({ id }) => id),
      ),
    );
  assert.deepEqual(remaining.map(({ id }) => id).sort(), available.map(({ id }) => id).sort());
});

test('concurrent independent page retries converge to one delete', async () => {
  const recipient = await createProfile();
  const notification = await createNotification({ recipientProfileId: recipient.id });
  const upperBound = await getNotificationCleanupUpperBound();
  assert.ok(upperBound);

  const results = await Promise.all([
    cleanupUnavailableNotificationsPage({ cursor: null, upperBound, pageSize: 10 }),
    cleanupUnavailableNotificationsPage({ cursor: null, upperBound, pageSize: 10 }),
  ]);

  assert.equal(results[0]!.deleted + results[1]!.deleted, 1);
  assert.equal(await db.$count(Notifications, eq(Notifications.id, notification.id)), 0);
  const retry = await cleanupUnavailableNotificationsPage({
    cursor: null,
    upperBound,
    pageSize: 10,
  });
  assert.equal(retry.deleted, 0);
  assert.equal(retry.done, true);
});

test('cleanup rejects missing or null fixed upper bounds', async () => {
  await assert.rejects(
    cleanupUnavailableNotificationsPage({ cursor: crypto.randomUUID() } as never),
    (error: unknown) =>
      error instanceof NotificationCleanupInputError &&
      /upperBound is required/.test(error.message),
  );
  await assert.rejects(
    cleanupUnavailableNotificationsPage({
      cursor: null,
      upperBound: null,
    } as never),
    (error: unknown) => error instanceof NotificationCleanupInputError,
  );
});
