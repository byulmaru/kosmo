import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Instances,
  Media,
  pg,
  PostContents,
  Posts,
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
import type {
  LocalPostCreateInput,
  LocalPostCreateResult,
} from '@kosmo/core/temporal/local-post-create';

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
          createLocalPostActivity: async (input: LocalPostCreateInput, postId: string) => {
            attemptPostIds.push(postId);
            const result = await activities.createLocalPostActivity(input, postId);
            if (result.ok && attemptPostIds.length === 1) {
              firstPostId = postId;
              postIds.add(postId);
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
