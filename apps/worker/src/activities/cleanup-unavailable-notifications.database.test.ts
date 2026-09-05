import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { MockActivityEnvironment } from '@temporalio/testing';
import { eq, inArray } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type { cleanupUnavailableNotificationsActivity as CleanupUnavailableNotificationsActivity } from './cleanup-unavailable-notifications';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let cleanupUnavailableNotificationsActivity: typeof CleanupUnavailableNotificationsActivity;

before(async () => {
  ({
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
  } = await import('@kosmo/core/db'));
  ({ cleanupUnavailableNotificationsActivity } =
    await import('./cleanup-unavailable-notifications'));
});

beforeEach(async () => {
  await db.delete(Notifications);
  await db.delete(ProfileFollows);
  await db.delete(ProfileFollowRequests);
  await db.delete(Reactions);
  await db.update(Posts).set({ currentContentId: null, repostSourceId: null, replyParentId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Profiles);
  await db.delete(Instances);
});

after(async () => pg.end());

const runCleanup = (): Promise<void> =>
  new MockActivityEnvironment().run(cleanupUnavailableNotificationsActivity) as Promise<void>;

test('cleanup deletes unavailable sources but preserves available and recipient-only inactive rows', async () => {
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

  await runCleanup();

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

  await runCleanup();

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

test('cleanup processes only a bounded batch per Activity invocation', async () => {
  const recipient = await createProfile();
  await Promise.all(
    Array.from({ length: 101 }, () => createNotification({ recipientProfileId: recipient.id })),
  );

  await runCleanup();

  assert.ok(
    (await db.$count(Notifications, eq(Notifications.recipientProfileId, recipient.id))) > 0,
  );
});

test('cleanup re-evaluates source availability before deleting selected rows', async () => {
  const follower = await createProfile();
  const recipient = await createProfile();
  const sourceId = crypto.randomUUID();
  const notification = await createNotification({
    recipientProfileId: recipient.id,
    sourceId,
  });
  assert.equal(await db.$count(ProfileFollows, eq(ProfileFollows.id, sourceId)), 0);
  const lockSession = await pg.reserve();
  let lockHeld = false;
  let cleanup: Promise<void> | undefined;

  try {
    await lockSession`BEGIN`;
    await lockSession`LOCK TABLE "notification" IN SHARE MODE`;
    lockHeld = true;

    cleanup = runCleanup();
    await waitForNotificationDeleteTableLock();

    await db
      .insert(ProfileFollows)
      .values({ followerProfileId: follower.id, followeeProfileId: recipient.id, id: sourceId });
    await lockSession`COMMIT`;
    lockHeld = false;

    await cleanup;
    assert.equal(await db.$count(Notifications, eq(Notifications.id, notification.id)), 1);
  } finally {
    if (lockHeld) {
      await lockSession`ROLLBACK`;
    }
    if (cleanup) {
      await Promise.allSettled([cleanup]);
    }
    lockSession.release();
  }
});

const waitForNotificationDeleteTableLock = async (): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [activity] = await pg<{ waiting: number }[]>`
      SELECT count(*)::integer AS waiting
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%delete from "notification"%'
    `;
    if ((activity?.waiting ?? 0) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail('Notification cleanup DELETE did not reach the table lock barrier');
};

const createProfile = async ({
  instanceState = InstanceState.ACTIVE,
  state = ProfileState.ACTIVE,
}: {
  readonly instanceState?: InstanceState;
  readonly state?: ProfileState;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: instanceState })
    .returning()
    .then(firstOrThrow);

  return db
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
};

const createFollow = async (followerProfileId: string, followeeProfileId: string) =>
  db
    .insert(ProfileFollows)
    .values({ followerProfileId, followeeProfileId })
    .returning()
    .then(firstOrThrow);

const createFollowRequest = async (followerProfileId: string, followeeProfileId: string) =>
  db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId, followeeProfileId })
    .returning()
    .then(firstOrThrow);

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

  if (!withContent) {
    return post;
  }

  const content = await db
    .insert(PostContents)
    .values({ postId: post.id, document: postContentDocumentFromText('cleanup fixture') })
    .returning()
    .then(firstOrThrow);
  const [updatedPost] = await db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning();
  return updatedPost ?? post;
};

const createReaction = async (profileId: string, postId: string) =>
  db.insert(Reactions).values({ profileId, postId, type: '❤️' }).returning().then(firstOrThrow);

const createNotification = async ({
  id,
  kind = NotificationKind.FOLLOW,
  recipientProfileId,
  sourceId = crypto.randomUUID(),
}: {
  readonly id?: string;
  readonly kind?: NotificationKind;
  readonly recipientProfileId: string;
  readonly sourceId?: string;
}) =>
  db
    .insert(Notifications)
    .values({ id, data: {}, kind, recipientProfileId, sourceId })
    .returning()
    .then(firstOrThrow);
