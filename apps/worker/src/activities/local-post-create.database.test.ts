import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import {
  AccountProfiles,
  Accounts,
  ActivityPubPosts,
  db,
  firstOrThrow,
  Instances,
  Media,
  pg,
  PostContents,
  Posts,
  ProfileBlocks,
  Profiles,
} from '@kosmo/core/db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure, WithStartWorkflowOperation } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { eq, inArray, sql } from 'drizzle-orm';
import { temporalTestExecutable } from '../temporal-test-executable.js';
import { createLocalPostActivity, generateLocalPostIdActivity } from './local-post-create';
import { createPostActivity, generatePostIdActivity } from './post-create';
import type { LocalPostCreateResult } from '@kosmo/core/temporal/local-post-create';
import type {
  ActivityPubPostCreateInput,
  PostCreateActivityInput,
  PostCreateActivityResult,
} from '@kosmo/core/temporal/post-create';

const profileIds = new Set<string>();
const accountIds = new Set<string>();
const instanceIds = new Set<string>();
const mediaIds = new Set<string>();
const postIds = new Set<string>();
const contentIds = new Set<string>();

const createAuthor = async (name: string) => {
  const suffix = `${name}-${crypto.randomUUID()}`;
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  accountIds.add(account.id);
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
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
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.MEMBER,
  });
  return { account, profile };
};

const createRemoteAuthor = async (name: string) => {
  const suffix = `${name}-${crypto.randomUUID()}`;
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.REMOTE,
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
  return { instance, profile };
};

const createParentPost = async (profileId: string, visibility: PostVisibility) => {
  const post = await db
    .insert(Posts)
    .values({
      currentContentId: null,
      profileId,
      replyParentId: null,
      repostSourceId: null,
      state: PostState.ACTIVE,
      visibility,
    })
    .returning()
    .then(firstOrThrow);
  postIds.add(post.id);
  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText('Parent post'), postId: post.id })
    .returning()
    .then(firstOrThrow);
  contentIds.add(content.id);
  await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
  return post.id;
};

const createReadyMedia = async (accountId: string, profileId: string) => {
  const media = await db
    .insert(Media)
    .values({
      accountId,
      mediaType: 'image/webp',
      profileId,
      readyAt: Temporal.Now.instant(),
      source: MediaSource.LOCAL,
      state: MediaState.READY,
      storageReference: `local-post-create:${crypto.randomUUID()}`,
      uploadExpiresAt: Temporal.Now.instant().add({ minutes: 5 }),
      url: `https://media.example/${crypto.randomUUID()}.webp`,
    })
    .returning()
    .then(firstOrThrow);
  mediaIds.add(media.id);
  return media;
};

const localInput = (
  author: Awaited<ReturnType<typeof createAuthor>>,
  overrides: Partial<LocalPostCreateInput> = {},
): LocalPostCreateInput => ({
  accountId: author.account.id,
  bodyText: 'An original post',
  origin: 'LOCAL',
  profileId: author.profile.id,
  visibility: PostVisibility.PUBLIC,
  ...overrides,
});

const remoteInput = (
  profileId: string,
  overrides: Partial<ActivityPubPostCreateInput> = {},
): ActivityPubPostCreateInput => ({
  document: postContentDocumentFromText('Remote post'),
  hashtagNames: [],
  media: [],
  mentionProfileIds: [],
  objectUri: `https://remote.example/notes/${crypto.randomUUID()}`,
  origin: 'ACTIVITYPUB',
  profileId,
  publishedAt: '2026-10-27T23:59:00Z',
  receivedAt: '2026-10-28T00:00:00Z',
  visibility: PostVisibility.PUBLIC,
  ...overrides,
});

afterEach(async () => {
  if (postIds.size > 0) {
    const ids = [...postIds];
    const contents = await db
      .select({ id: PostContents.id })
      .from(PostContents)
      .where(inArray(PostContents.postId, ids));
    for (const content of contents) {
      contentIds.add(content.id);
    }
    await db
      .update(Posts)
      .set({ currentContentId: null, replyParentId: null, repostSourceId: null })
      .where(inArray(Posts.id, ids));
    if (contentIds.size > 0) {
      await db
        .update(PostContents)
        .set({ postId: null })
        .where(inArray(PostContents.id, [...contentIds]));
    }
    await db.delete(Posts).where(inArray(Posts.id, ids));
  }
  if (profileIds.size > 0) {
    const media = await db
      .select({ id: Media.id })
      .from(Media)
      .where(inArray(Media.profileId, [...profileIds]));
    for (const item of media) {
      mediaIds.add(item.id);
    }
  }
  if (contentIds.size > 0) {
    await db.delete(PostContents).where(inArray(PostContents.id, [...contentIds]));
  }
  if (mediaIds.size > 0) {
    await db.delete(Media).where(inArray(Media.id, [...mediaIds]));
  }
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
  }
  if (accountIds.size > 0) {
    await db.delete(Accounts).where(inArray(Accounts.id, [...accountIds]));
  }
  profileIds.clear();
  accountIds.clear();
  instanceIds.clear();
  mediaIds.clear();
  postIds.clear();
  contentIds.clear();
});

after(async () => pg.end());

test(
  'Local Post UWS retries a committed Activity response loss with the same allocated ID',
  { timeout: 120_000 },
  async () => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    process.env.TEMPORAL_ADDRESS = environment.address;
    process.env.TEMPORAL_NAMESPACE = environment.namespace ?? 'default';
    let worker: Worker | undefined;
    let workerRun: Promise<void> | undefined;
    try {
      const [{ LOCAL_POST_CREATE_UPDATE_NAME, localPostCreateWorkflow }, activities] =
        await Promise.all([
          import('@kosmo/core/temporal/local-post-create'),
          import('../activities'),
        ]);
      const author = await createAuthor('response-loss');
      const requestId = crypto.randomUUID();
      const workflowId = localPostCreateWorkflow.workflowIdFromArgs({ requestId });
      const attemptPostIds: string[] = [];
      let firstPostId: string | undefined;
      worker = await Worker.create({
        activities: {
          ...activities,
          createPostActivity: async (
            input: PostCreateActivityInput,
          ): Promise<PostCreateActivityResult> => {
            attemptPostIds.push(input.postId);
            const result = await activities.createPostActivity(input);
            if (result.ok && attemptPostIds.length === 1) {
              firstPostId = input.postId;
              postIds.add(input.postId);
              throw ApplicationFailure.retryable('Activity completion response was lost');
            }
            return result;
          },
          createMentionNotificationActivity: async () => {},
          createNotificationActivity: async () => {},
          createQuoteNotificationActivity: async () => {},
          createReplyNotificationActivity: async () => {},
          sendLocalPostCreateActivity: async () => {},
        },
        connection: environment.nativeConnection,
        namespace: environment.namespace,
        taskQueue: KOSMO_TASK_QUEUE,
        workflowsPath: new URL('../workflows/index.ts', import.meta.url).pathname,
      });
      workerRun = worker.run();

      const result = (await environment.client.workflow.executeUpdateWithStart(
        LOCAL_POST_CREATE_UPDATE_NAME,
        {
          args: [localInput(author)],
          updateId: crypto.randomUUID(),
          startWorkflowOperation: new WithStartWorkflowOperation(localPostCreateWorkflow.workflow, {
            args: [{ requestId }],
            taskQueue: KOSMO_TASK_QUEUE,
            workflowId,
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowIdReusePolicy: 'REJECT_DUPLICATE',
          }),
        },
      )) as LocalPostCreateResult;
      assert.ok(firstPostId);
      const committedPostId = firstPostId;
      assert.deepEqual(result, { postId: committedPostId });
      assert.equal(attemptPostIds.length, 2);
      assert.deepEqual(attemptPostIds, [committedPostId, committedPostId]);

      await environment.client.workflow.getHandle(workflowId).result();
      const post = await db
        .select()
        .from(Posts)
        .where(eq(Posts.id, result.postId))
        .then(firstOrThrow);
      assert.equal(post.profileId, author.profile.id);
      assert.notEqual(post.currentContentId, null);
      assert.equal(
        await db
          .select()
          .from(PostContents)
          .where(eq(PostContents.postId, result.postId))
          .then((rows) => rows.length),
        1,
      );
    } finally {
      if (worker?.getState() === 'RUNNING') {
        worker.shutdown();
      }
      if (workerRun !== undefined) {
        await workerRun;
      }
      await environment.teardown();
    }
  },
);

test('Local Post ID Activity gets a database UUIDv7 without writing a Post', async () => {
  const [first, second] = await Promise.all([
    generateLocalPostIdActivity(),
    generateLocalPostIdActivity(),
  ]);
  postIds.add(first);
  postIds.add(second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, first))
      .then((rows) => rows.length),
    0,
  );
});

test('Local Post Activity returns a committed retry before revalidating changed parent and media', async () => {
  const author = await createAuthor('author');
  const other = await createAuthor('other');
  const parent = await createParentPost(other.profile.id, PostVisibility.PUBLIC);
  const media = await createReadyMedia(author.account.id, author.profile.id);
  const postId = await generateLocalPostIdActivity();
  postIds.add(postId);
  const input = localInput(author, {
    bodyText: 'Original body',
    media: [{ altText: 'Request alt', mediaId: media.id }],
    replyParentId: parent,
  });

  const committed = await createLocalPostActivity(input, postId);
  assert.deepEqual(committed, { ok: true, result: { postId } });
  const originalContent = await db
    .select({ document: PostContents.document })
    .from(PostContents)
    .where(eq(PostContents.postId, postId))
    .then(firstOrThrow);

  await db.update(Posts).set({ visibility: PostVisibility.DIRECT }).where(eq(Posts.id, parent));
  await db
    .update(Media)
    .set({ accountId: other.account.id, altText: 'Changed after commit' })
    .where(eq(Media.id, media.id));

  assert.deepEqual(await createLocalPostActivity(input, postId), committed);
  assert.deepEqual(
    await db
      .select({ document: PostContents.document })
      .from(PostContents)
      .where(eq(PostContents.postId, postId))
      .then(firstOrThrow),
    originalContent,
  );
  assert.equal(
    await db
      .select({ altText: Media.altText })
      .from(Media)
      .where(eq(Media.id, media.id))
      .then(firstOrThrow)
      .then(({ altText }) => altText),
    'Changed after commit',
  );
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, postId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.postId, postId))
      .then((rows) => rows.length),
    1,
  );
});

test('Concurrent Local Post Activity retries converge on one Post and content row', async () => {
  const author = await createAuthor('concurrent');
  const postId = await generateLocalPostIdActivity();
  postIds.add(postId);
  const input = localInput(author);

  const releasePostTable = Promise.withResolvers<void>();
  const postTableLocked = Promise.withResolvers<void>();
  const lockHolder = db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE "post" IN ACCESS EXCLUSIVE MODE`);
    postTableLocked.resolve();
    await releasePostTable.promise;
  });
  await postTableLocked.promise;
  const concurrent = Promise.all([
    createLocalPostActivity(input, postId),
    createLocalPostActivity(input, postId),
  ]);
  let overlapObserved = false;
  try {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [row] = await pg.unsafe<{ count: number }[]>(`
        SELECT count(*)::integer AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query ILIKE 'insert into "post"%'
      `);
      if (row?.count === 2) {
        overlapObserved = true;
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    releasePostTable.resolve();
    await lockHolder;
  }
  const results = await concurrent;

  assert.equal(overlapObserved, true, 'Both Post inserts should wait behind the test table lock');
  assert.deepEqual(results, [
    { ok: true, result: { postId } },
    { ok: true, result: { postId } },
  ]);
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, postId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.postId, postId))
      .then((rows) => rows.length),
    1,
  );
});

test('Local Post Activity rollback removes its claim and content and restores media ALT on failure', async () => {
  const author = await createAuthor('rollback');
  const hiddenAuthor = await createAuthor('hidden');
  const parent = await createParentPost(hiddenAuthor.profile.id, PostVisibility.DIRECT);
  const media = await createReadyMedia(author.account.id, author.profile.id);
  const postId = await generateLocalPostIdActivity();
  postIds.add(postId);

  const result = await createLocalPostActivity(
    localInput(author, {
      bodyText: 'This must roll back',
      media: [{ altText: 'Must not persist', mediaId: media.id }],
      replyParentId: parent,
    }),
    postId,
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail('Expected hidden Reply Parent to fail');
  }
  assert.equal(result.error.code, 'NOT_FOUND');
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, postId))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.postId, postId))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select({ altText: Media.altText })
      .from(Media)
      .where(eq(Media.id, media.id))
      .then(firstOrThrow)
      .then(({ altText }) => altText),
    null,
  );
});

test('Local Post Activity rejects a claimed ID owned by another account or profile', async () => {
  const author = await createAuthor('identity-owner');
  const other = await createAuthor('identity-other');
  const postId = await generateLocalPostIdActivity();
  postIds.add(postId);

  assert.deepEqual(await createLocalPostActivity(localInput(author), postId), {
    ok: true,
    result: { postId },
  });
  const conflicting = await createLocalPostActivity(localInput(other), postId);
  assert.equal(conflicting.ok, false);
  if (conflicting.ok) {
    assert.fail('Expected a reused Local Post ID to conflict');
  }
  assert.equal(conflicting.error.code, 'CONFLICT');
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, postId))
      .then((rows) => rows.length),
    1,
  );
});

test('Post Activity retries a committed ActivityPub Post before revalidating parent and keeps timestamps and media', async () => {
  const author = await createRemoteAuthor('remote-retry');
  const parentAuthor = await createAuthor('remote-retry-parent');
  const parentPostId = await createParentPost(parentAuthor.profile.id, PostVisibility.PUBLIC);
  const postId = await generatePostIdActivity();
  postIds.add(postId);
  const input = remoteInput(author.profile.id, {
    media: [
      {
        altText: 'Remote cover',
        mediaType: 'image/webp',
        url: `https://remote.example/media/${crypto.randomUUID()}.webp`,
      },
    ],
    objectUri: `https://remote.example/notes/${crypto.randomUUID()}`,
    replyParentId: parentPostId,
  });

  const committed = await createPostActivity({ input, postId });
  assert.deepEqual(committed, {
    ok: true,
    result: { authorProfileId: author.profile.id, postId, status: 'created' },
  });
  const storedPost = await db
    .select({ createdAt: Posts.createdAt, replyParentId: Posts.replyParentId })
    .from(Posts)
    .where(eq(Posts.id, postId))
    .then(firstOrThrow);
  const storedContent = await db
    .select({ createdAt: PostContents.createdAt, document: PostContents.document })
    .from(PostContents)
    .where(eq(PostContents.postId, postId))
    .then(firstOrThrow);
  const media = await db.select().from(Media).where(eq(Media.profileId, author.profile.id));
  for (const item of media) {
    mediaIds.add(item.id);
  }
  assert.equal(
    storedPost.createdAt.toString(),
    Temporal.Instant.from(input.publishedAt!).toString(),
  );
  assert.equal(storedPost.replyParentId, parentPostId);
  assert.equal(
    storedContent.createdAt.toString(),
    Temporal.Instant.from(input.receivedAt).toString(),
  );
  assert.equal(media.length, 1);
  assert.equal(media[0]?.altText, 'Remote cover');
  assert.ok(storedContent.document.body.content.some((node) => node.type === 'media'));
  assert.equal(
    await db
      .select()
      .from(ActivityPubPosts)
      .where(eq(ActivityPubPosts.uri, input.objectUri))
      .then((rows) => rows.length),
    1,
  );

  await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, parentPostId));
  assert.deepEqual(await createPostActivity({ input, postId }), committed);
  assert.equal(
    await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.postId, postId))
      .then((rows) => rows.length),
    1,
  );
  assert.equal(
    await db
      .select()
      .from(Media)
      .where(eq(Media.profileId, author.profile.id))
      .then((rows) => rows.length),
    1,
  );
});

test('Post Activity rolls back a fresh URI duplicate and returns the persisted owner and Post ID', async () => {
  const author = await createRemoteAuthor('remote-uri-owner');
  const otherAuthor = await createRemoteAuthor('remote-uri-duplicate');
  const postId = await generatePostIdActivity();
  const duplicatePostId = await generatePostIdActivity();
  postIds.add(postId);
  postIds.add(duplicatePostId);
  const uri = `https://remote.example/notes/${crypto.randomUUID()}`;
  const media = {
    altText: 'Original media',
    mediaType: 'image/png',
    url: `https://remote.example/media/${crypto.randomUUID()}.png`,
  };
  const input = remoteInput(author.profile.id, { media: [media], objectUri: uri });

  assert.deepEqual(await createPostActivity({ input, postId }), {
    ok: true,
    result: { authorProfileId: author.profile.id, postId, status: 'created' },
  });
  const identityConflict = await createPostActivity({
    input: remoteInput(otherAuthor.profile.id, { objectUri: uri }),
    postId,
  });
  assert.equal(identityConflict.ok, false);
  if (identityConflict.ok) {
    assert.fail('Expected a reused Post ID with a different ActivityPub identity to conflict');
  }
  assert.equal(identityConflict.error.code, 'CONFLICT');
  const firstMedia = await db.select().from(Media).where(eq(Media.profileId, author.profile.id));
  for (const item of firstMedia) {
    mediaIds.add(item.id);
  }

  const duplicateInput = remoteInput(otherAuthor.profile.id, {
    document: postContentDocumentFromText('Changed duplicate content'),
    media: [media],
    objectUri: uri,
    visibility: PostVisibility.UNLISTED,
  });
  assert.deepEqual(await createPostActivity({ input: duplicateInput, postId: duplicatePostId }), {
    ok: true,
    result: { authorProfileId: author.profile.id, postId, status: 'duplicate' },
  });
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, duplicatePostId))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.postId, duplicatePostId))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(Media)
      .where(eq(Media.profileId, otherAuthor.profile.id))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(Media)
      .where(eq(Media.profileId, author.profile.id))
      .then((rows) => rows.length),
    1,
  );
});

test('Post Activity falls back for an invalid remote Reply Parent but rejects a blocked parent', async () => {
  const author = await createRemoteAuthor('remote-reply');
  const parentAuthor = await createAuthor('remote-reply-parent');
  const invalidParentId = await createParentPost(parentAuthor.profile.id, PostVisibility.PUBLIC);
  await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, invalidParentId));
  const postId = await generatePostIdActivity();
  postIds.add(postId);
  const input = remoteInput(author.profile.id, {
    media: [
      {
        altText: null,
        mediaType: 'image/png',
        url: `https://remote.example/media/${crypto.randomUUID()}.png`,
      },
    ],
    replyParentId: invalidParentId,
  });

  const fallback = await createPostActivity({ input, postId });
  assert.deepEqual(fallback, {
    ok: true,
    result: {
      authorProfileId: author.profile.id,
      postId,
      replyParentFallback: true,
      status: 'created',
    },
  });
  assert.equal(
    await db
      .select({ replyParentId: Posts.replyParentId })
      .from(Posts)
      .where(eq(Posts.id, postId))
      .then(firstOrThrow)
      .then(({ replyParentId }) => replyParentId),
    null,
  );
  assert.deepEqual(await createPostActivity({ input, postId }), fallback);
  const media = await db.select().from(Media).where(eq(Media.profileId, author.profile.id));
  for (const item of media) {
    mediaIds.add(item.id);
  }
  assert.equal(media.length, 1);

  const blockedAuthor = await createRemoteAuthor('remote-blocked-reply');
  const blockedParentAuthor = await createAuthor('remote-blocked-parent');
  const blockedParentId = await createParentPost(
    blockedParentAuthor.profile.id,
    PostVisibility.PUBLIC,
  );
  await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, blockedParentId));
  await db.insert(ProfileBlocks).values({
    ownerProfileId: blockedAuthor.profile.id,
    targetProfileId: blockedParentAuthor.profile.id,
  });
  const blockedPostId = await generatePostIdActivity();
  postIds.add(blockedPostId);
  const blocked = await createPostActivity({
    input: remoteInput(blockedAuthor.profile.id, { replyParentId: blockedParentId }),
    postId: blockedPostId,
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) {
    assert.fail('Expected a blocked remote Reply to be rejected');
  }
  assert.equal(blocked.error.kind, 'reply_profile_blocked');
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, blockedPostId))
      .then((rows) => rows.length),
    0,
  );

  const rejectedPostId = await generatePostIdActivity();
  postIds.add(rejectedPostId);
  const mediaRejected = await createPostActivity({
    input: remoteInput(blockedAuthor.profile.id, {
      media: Array.from({ length: 5 }, () => ({
        altText: null,
        mediaType: 'image/png',
        url: `https://remote.example/media/${crypto.randomUUID()}.png`,
      })),
    }),
    postId: rejectedPostId,
  });
  assert.equal(mediaRejected.ok, false);
  if (mediaRejected.ok) {
    assert.fail('Expected too many Remote Media candidates to be rejected');
  }
  assert.equal(mediaRejected.error.kind, 'note_media_validation_rejected');
  assert.equal(
    await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, rejectedPostId))
      .then((rows) => rows.length),
    0,
  );
  assert.equal(
    await db
      .select()
      .from(Media)
      .where(eq(Media.profileId, blockedAuthor.profile.id))
      .then((rows) => rows.length),
    0,
  );
});
