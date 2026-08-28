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
import { ApplicationFailure } from '@temporalio/client';
import { MockActivityEnvironment } from '@temporalio/testing';
import { and, eq, inArray } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type {
  cleanupUnavailableNotificationPageActivity as CleanupUnavailableNotificationPageActivity,
  getNotificationCleanupUpperBoundActivity as GetNotificationCleanupUpperBoundActivity,
} from './cleanup-unavailable-notifications';

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
let cleanupUnavailableNotificationPageActivity: typeof CleanupUnavailableNotificationPageActivity;
let getNotificationCleanupUpperBoundActivity: typeof GetNotificationCleanupUpperBoundActivity;
type CleanupPageResult = Awaited<ReturnType<typeof cleanupUnavailableNotificationPageActivity>>;

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
  ({ cleanupUnavailableNotificationPageActivity, getNotificationCleanupUpperBoundActivity } =
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

const runPage = (
  input: Parameters<typeof cleanupUnavailableNotificationPageActivity>[0],
  attempt = 1,
): Promise<CleanupPageResult> =>
  new MockActivityEnvironment({ attempt }).run(
    cleanupUnavailableNotificationPageActivity,
    input,
  ) as Promise<CleanupPageResult>;

test('Notification cleanup Activity는 bounded 결과와 시작·완료 heartbeat를 남긴다', async () => {
  const recipient = await createProfile();
  await createNotification({ recipientProfileId: recipient.id });
  const upperBound = await captureUpperBound();
  const environment = new MockActivityEnvironment({ attempt: 2 });
  const heartbeats: unknown[] = [];
  environment.on('heartbeat', (details) => heartbeats.push(details));

  const result = (await environment.run(cleanupUnavailableNotificationPageActivity, {
    cursor: null,
    upperBound,
    pageSize: 10,
  })) as CleanupPageResult;

  assert.equal(result.done, true);
  assert.equal(result.scanned, 1);
  assert.equal(result.deleted, 1);
  assert.equal(result.skipped, 0);
  assert.deepEqual(
    heartbeats.map((details) => (details as { phase: string }).phase),
    ['started', 'completed'],
  );
  assert.equal((heartbeats[0] as { attempt: number }).attempt, 2);
  assert.equal((heartbeats[1] as { upperBound: string }).upperBound, upperBound);
});

test('Notification cleanup upper-bound Activity는 null bound와 heartbeat를 반환한다', async () => {
  const environment = new MockActivityEnvironment({ attempt: 2 });
  const heartbeats: unknown[] = [];
  environment.on('heartbeat', (details) => heartbeats.push(details));

  const result = await environment.run(getNotificationCleanupUpperBoundActivity);

  assert.equal(result, null);
  assert.deepEqual(
    heartbeats.map((details) => (details as { phase: string }).phase),
    ['started', 'completed'],
  );
  assert.equal((heartbeats[0] as { attempt: number }).attempt, 2);
  assert.equal((heartbeats[1] as { upperBound: string | null }).upperBound, null);
});

test('empty cleanup captures a null upper bound separately and an explicit bound page completes', async () => {
  const boundEnvironment = new MockActivityEnvironment({ attempt: 1 });
  assert.equal(await boundEnvironment.run(getNotificationCleanupUpperBoundActivity), null);

  const upperBound = crypto.randomUUID();
  const result = await runPage({ cursor: null, upperBound, pageSize: 10 });

  assert.equal(result.done, true);
  assert.equal(result.nextCursor, null);
  assert.deepEqual(
    { scanned: result.scanned, deleted: result.deleted, skipped: result.skipped },
    { scanned: 0, deleted: 0, skipped: 0 },
  );
});

test('cleanup deletes missing, mismatched, and hidden sources but preserves available and inactive recipients', async () => {
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

  const upperBound = await captureUpperBound();
  const result = await runPage({ cursor: null, upperBound, pageSize: 20 });

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

  const upperBound = await captureUpperBound();
  const result = await runPage({ cursor: null, upperBound, pageSize: 20 });

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

test('exclusive cursor and fixed upper bound leave later rows for the next sweep', async () => {
  const recipient = await createProfile();
  const first = await createNotification({
    id: '00000000-0000-7000-8000-000000000001',
    recipientProfileId: recipient.id,
  });
  const second = await createNotification({
    id: '00000000-0000-7000-8000-000000000002',
    recipientProfileId: recipient.id,
  });
  const third = await createNotification({
    id: '00000000-0000-7000-8000-000000000003',
    recipientProfileId: recipient.id,
  });
  const upperBound = await captureUpperBound();

  const firstPage = await runPage({ cursor: null, upperBound, pageSize: 2 });
  assert.equal(firstPage.scanned, 2);
  assert.equal(firstPage.deleted, 2);
  assert.equal(firstPage.done, false);
  assert.equal(firstPage.nextCursor, second.id);

  const later = await createNotification({
    id: '00000000-0000-7000-8000-000000000010',
    recipientProfileId: recipient.id,
  });
  const secondPage = await runPage({
    cursor: firstPage.nextCursor,
    upperBound,
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

test('cleanup re-evaluates source availability after scanning a notification page', async () => {
  const follower = await createProfile();
  const recipient = await createProfile();
  const sourceId = crypto.randomUUID();
  const notification = await createNotification({
    recipientProfileId: recipient.id,
    sourceId,
  });
  const upperBound = await captureUpperBound();
  assert.equal(await db.$count(ProfileFollows, eq(ProfileFollows.id, sourceId)), 0);
  const lockSession = await pg.reserve();
  let lockHeld = false;
  let cleanup: Promise<CleanupPageResult> | undefined;

  try {
    await lockSession`BEGIN`;
    await lockSession`LOCK TABLE "notification" IN SHARE MODE`;
    lockHeld = true;

    // The page scan only reads Notification IDs, so the source is still
    // absent when this transaction selects the row. The table lock lets the
    // source be recreated after that scan but before the conditional DELETE
    // starts its own statement snapshot.
    cleanup = runPage({ cursor: null, upperBound, pageSize: 10 });
    await waitForNotificationDeleteTableLock();

    await db
      .insert(ProfileFollows)
      .values({ followerProfileId: follower.id, followeeProfileId: recipient.id, id: sourceId });
    await lockSession`COMMIT`;
    lockHeld = false;

    const result = await cleanup;
    assert.deepEqual(
      {
        scanned: result.scanned,
        deleted: result.deleted,
        skipped: result.skipped,
      },
      { scanned: 1, deleted: 0, skipped: 1 },
    );
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

test('concurrent independent page retries converge to one delete', async () => {
  const recipient = await createProfile();
  const notification = await createNotification({ recipientProfileId: recipient.id });
  const upperBound = await captureUpperBound();

  const results = await Promise.all([
    runPage({ cursor: null, upperBound, pageSize: 10 }),
    runPage({ cursor: null, upperBound, pageSize: 10 }),
  ]);

  assert.equal(results[0]!.deleted + results[1]!.deleted, 1);
  assert.equal(await db.$count(Notifications, eq(Notifications.id, notification.id)), 0);
  const retry = await runPage({ cursor: null, upperBound, pageSize: 10 });
  assert.equal(retry.deleted, 0);
  assert.equal(retry.done, true);
});

test('null/undefined cleanup input is rejected as non-retryable Activity failure', async () => {
  for (const input of [null, undefined]) {
    await assert.rejects(
      runPage(input as never),
      (error: unknown) =>
        error instanceof ApplicationFailure &&
        error.type === 'CleanupInvalidInputError' &&
        error.nonRetryable === true,
    );
  }
});

test('invalid cleanup input is rejected as non-retryable Activity failure', async () => {
  await assert.rejects(
    runPage({ cursor: null, upperBound: null, pageSize: 10 } as never),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === 'CleanupInvalidInputError' &&
      error.nonRetryable === true &&
      /upperBound is required/.test(error.message),
  );
  await assert.rejects(
    runPage({ cursor: null, upperBound: crypto.randomUUID(), pageSize: 0 }),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === 'CleanupInvalidInputError' &&
      error.nonRetryable === true &&
      /pageSize must be an integer/.test(error.message),
  );
  await assert.rejects(
    runPage({ cursor: null, upperBound: crypto.randomUUID(), pageSize: 1_001 }),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === 'CleanupInvalidInputError' &&
      error.nonRetryable === true &&
      /pageSize must be an integer between 1 and 1000/.test(error.message),
  );
  await assert.rejects(
    runPage({ cursor: 'not-a-uuid', upperBound: crypto.randomUUID(), pageSize: 10 }),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === 'CleanupInvalidInputError' &&
      error.nonRetryable === true &&
      /cursor must be a UUID/.test(error.message),
  );
  await assert.rejects(
    runPage({ cursor: null, upperBound: 'not-a-uuid', pageSize: 10 }),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === 'CleanupInvalidInputError' &&
      error.nonRetryable === true &&
      /upperBound must be a UUID/.test(error.message),
  );
});

const captureUpperBound = async () => {
  const environment = new MockActivityEnvironment({ attempt: 1 });
  const upperBound = (await environment.run(getNotificationCleanupUpperBoundActivity)) as
    | string
    | null;
  assert.ok(upperBound);
  return upperBound;
};

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
