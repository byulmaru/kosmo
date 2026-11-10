import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { getLinkPreviewUrlHash } from '@kosmo/core/link-preview';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { eq, inArray } from 'drizzle-orm';
import { createTestWorkflowEnvironment, testWorkflowSource } from './temporal-test-environment.js';
import {
  LINK_PREVIEW_COLLECTION_WORKFLOW_TYPE,
  linkPreviewCollectionWorkflowDefinition,
} from './workflows/link-preview';
import type * as CoreDb from '@kosmo/core/db';
import type { LinkPreview } from '@kosmo/core/link-preview';
import type { PostContentDocumentV1 } from '@kosmo/core/post-content';
import type * as WorkerActivities from './activities';
import type { LinkPreviewCollectionInput } from './workflows/link-preview';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const requestedUrls = new Set<string>();

process.env.DATABASE_URL = databaseUrl;
process.env.PUBLIC_ORIGIN = publicOrigin;
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

let fetchedPreview: LinkPreview | null = null;
let fetchLinkPreviewCalls = 0;
let db: typeof CoreDb.db;
let first: typeof CoreDb.first;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let LinkPreviews: typeof CoreDb.LinkPreviews;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let pg: typeof CoreDb.pg;
let collectPostLinkPreviewActivity: typeof WorkerActivities.collectPostLinkPreviewActivity;
let fetchLinkPreviewInput: string | undefined;

const instanceIds = new Set<string>();
const profileIds = new Set<string>();
const postIds = new Set<string>();
const contentIds = new Set<string>();

mock.module(new URL('./activities/link-preview-client.js', import.meta.url).href, {
  exports: {
    fetchLinkPreview: async (url: string) => {
      fetchLinkPreviewCalls += 1;
      fetchLinkPreviewInput = url;
      return fetchedPreview;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  ({ db, first, firstOrThrow, Instances, LinkPreviews, PostContents, Posts, Profiles, pg } =
    await import('@kosmo/core/db'));
  ({ collectPostLinkPreviewActivity } = await import('./activities/link-preview'));
});

afterEach(async () => {
  if (requestedUrls.size > 0) {
    await db
      .delete(LinkPreviews)
      .where(inArray(LinkPreviews.urlHash, [...requestedUrls].map(getLinkPreviewUrlHash)));
    requestedUrls.clear();
  }
  if (postIds.size > 0) {
    await db
      .update(Posts)
      .set({ currentContentId: null })
      .where(inArray(Posts.id, [...postIds]));
  }
  if (contentIds.size > 0) {
    await db.delete(PostContents).where(inArray(PostContents.id, [...contentIds]));
    contentIds.clear();
  }
  if (postIds.size > 0) {
    await db.delete(Posts).where(inArray(Posts.id, [...postIds]));
    postIds.clear();
  }
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
    profileIds.clear();
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
    instanceIds.clear();
  }
  fetchedPreview = null;
  fetchLinkPreviewCalls = 0;
  fetchLinkPreviewInput = undefined;
});

after(async () => {
  await pg.end();
});

const linkedDocument = (urls: readonly string[], includeMedia = false): PostContentDocumentV1 => ({
  version: 1,
  summary: null,
  body: {
    type: 'doc',
    content: [
      ...(includeMedia
        ? [{ type: 'media' as const, attrs: { mediaId: crypto.randomUUID() } }]
        : []),
      {
        type: 'paragraph',
        content:
          urls.length === 0
            ? [{ type: 'text', text: 'No link' }]
            : urls.map((href) => ({
                marks: [{ attrs: { href }, type: 'link' }],
                text: 'Link',
                type: 'text',
              })),
      },
    ],
  },
});

const createPost = async (document: PostContentDocumentV1): Promise<string> => {
  const suffix = crypto.randomUUID();
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
  const post = await db
    .insert(Posts)
    .values({
      currentContentId: null,
      profileId: profile.id,
      replyParentId: null,
      repostSourceId: null,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  postIds.add(post.id);
  const content = await db
    .insert(PostContents)
    .values({ document, postId: post.id })
    .returning()
    .then(firstOrThrow);
  contentIds.add(content.id);
  await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
  return post.id;
};

test(
  'Link Preview Workflow uses the production registry and persists success, failure, and backoff state',
  { timeout: 120_000 },
  async (t) => {
    const firstUrl = 'https://preview.example/article?source=post&keep=1#summary';
    const laterUrl = 'https://preview.example/later';
    const staleUrl = 'https://preview.example/stale';
    requestedUrls.add(firstUrl);
    requestedUrls.add(staleUrl);
    const firstPostId = await createPost(linkedDocument([firstUrl, laterUrl]));
    const sameUrlPostId = await createPost(linkedDocument([firstUrl]));
    const mediaPostId = await createPost(linkedDocument([firstUrl], true));
    const noLinkPostId = await createPost(linkedDocument([]));
    const stalePostId = await createPost(linkedDocument([staleUrl]));

    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-link-preview-${process.pid}`;
    const worker = await Worker.create({
      activities: { collectPostLinkPreviewActivity },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      ...testWorkflowSource,
    });

    const runWorkflow = (input: LinkPreviewCollectionInput) =>
      environment.client.workflow.execute(LINK_PREVIEW_COLLECTION_WORKFLOW_TYPE, {
        args: [input],
        taskQueue,
        workflowId: linkPreviewCollectionWorkflowDefinition.workflowIdFromArgs(input),
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });

    await worker.runUntil(async () => {
      await runWorkflow({ postId: firstPostId });
      assert.equal(fetchLinkPreviewCalls, 1);
      assert.equal(fetchLinkPreviewInput, firstUrl);

      await runWorkflow({ postId: mediaPostId });
      await runWorkflow({ postId: noLinkPostId });
      assert.equal(fetchLinkPreviewCalls, 1, 'Media and link-free content should not fetch');

      const initialFailureRow = await db
        .select()
        .from(LinkPreviews)
        .where(eq(LinkPreviews.urlHash, getLinkPreviewUrlHash(firstUrl)))
        .limit(1)
        .then(first);
      assert.ok(initialFailureRow);
      assert.equal(initialFailureRow.url, firstUrl);
      assert.equal(initialFailureRow.title, null);
      assert.equal(initialFailureRow.description, null);
      assert.equal(initialFailureRow.imageUrl, null);
      assert.equal(initialFailureRow.lastSuccessfulFetchAt, null);
      assert.ok(initialFailureRow.lastFailureAt);

      await runWorkflow({ postId: sameUrlPostId });
      assert.equal(
        fetchLinkPreviewCalls,
        1,
        'new posts should share recent failure backoff by URL',
      );

      await runWorkflow({ postId: firstPostId });
      assert.equal(fetchLinkPreviewCalls, 1, 'recent failure should prevent another fetch');

      await db
        .update(LinkPreviews)
        .set({ lastFailureAt: Temporal.Now.instant().subtract({ minutes: 11 }) })
        .where(eq(LinkPreviews.urlHash, getLinkPreviewUrlHash(firstUrl)));
      fetchedPreview = {
        url: firstUrl,
        title: 'Fetched title',
        description: 'Fetched description',
        imageUrl: 'https://preview.example/image.png',
      };

      await runWorkflow({ postId: firstPostId });
      assert.equal(fetchLinkPreviewCalls, 2);
      assert.equal(fetchLinkPreviewInput, firstUrl);

      const storedSuccess = await db
        .select()
        .from(LinkPreviews)
        .where(eq(LinkPreviews.urlHash, getLinkPreviewUrlHash(firstUrl)))
        .limit(1)
        .then(first);
      assert.ok(storedSuccess);
      assert.equal(storedSuccess.title, fetchedPreview.title);
      assert.equal(storedSuccess.description, fetchedPreview.description);
      assert.equal(storedSuccess.imageUrl, fetchedPreview.imageUrl);
      assert.ok(storedSuccess.lastSuccessfulFetchAt);
      assert.equal(storedSuccess.lastFailureAt, null);

      await runWorkflow({ postId: firstPostId });
      assert.equal(fetchLinkPreviewCalls, 2, 'fresh successful metadata should prevent refetch');
      await runWorkflow({ postId: sameUrlPostId });
      assert.equal(fetchLinkPreviewCalls, 2, 'new posts should share fresh metadata by URL');

      const previousSuccessfulFetchAt = Temporal.Now.instant().subtract({ hours: 192 });
      const previousMetadata = {
        url: staleUrl,
        urlHash: getLinkPreviewUrlHash(staleUrl),
        title: 'Previous title',
        description: 'Previous description',
        imageUrl: 'https://preview.example/old-image.png',
        lastSuccessfulFetchAt: previousSuccessfulFetchAt,
      };
      await db.insert(LinkPreviews).values(previousMetadata);
      fetchedPreview = null;

      await runWorkflow({ postId: stalePostId });
      assert.equal(fetchLinkPreviewCalls, 3);
      assert.equal(fetchLinkPreviewInput, staleUrl);

      const storedFailure = await db
        .select()
        .from(LinkPreviews)
        .where(eq(LinkPreviews.urlHash, getLinkPreviewUrlHash(staleUrl)))
        .limit(1)
        .then(first);
      assert.ok(storedFailure);
      assert.equal(storedFailure.title, previousMetadata.title);
      assert.equal(storedFailure.description, previousMetadata.description);
      assert.equal(storedFailure.imageUrl, previousMetadata.imageUrl);
      assert.equal(
        storedFailure.lastSuccessfulFetchAt?.epochMilliseconds,
        previousSuccessfulFetchAt.epochMilliseconds,
      );
      assert.ok(storedFailure.lastFailureAt);

      await runWorkflow({ postId: stalePostId });
      assert.equal(fetchLinkPreviewCalls, 3, 'recent failure should prevent another fetch');
    });
  },
);
