import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import { normalizeLinkPreviewUrl } from '@kosmo/core/link-preview';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { eq, inArray } from 'drizzle-orm';
import { createTestWorkflowEnvironment, testWorkflowSource } from './temporal-test-environment.js';
import type * as CoreDb from '@kosmo/core/db';
import type { LinkPreview } from '@kosmo/core/link-preview';
import type { LinkPreviewRefreshInput } from '@kosmo/core/temporal/link-preview';
import type * as WorkerActivities from './activities';

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
let LinkPreviews: typeof CoreDb.LinkPreviews;
let pg: typeof CoreDb.pg;
let refreshLinkPreviewActivity: typeof WorkerActivities.refreshLinkPreviewActivity;
let fetchLinkPreviewInput: string | undefined;

mock.module('@kosmo/core/link-preview', {
  exports: {
    normalizeLinkPreviewUrl,
    fetchLinkPreview: async (url: string) => {
      fetchLinkPreviewCalls += 1;
      fetchLinkPreviewInput = url;
      return fetchedPreview;
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  ({ db, first, LinkPreviews, pg } = await import('@kosmo/core/db'));
  ({ refreshLinkPreviewActivity } = await import('./activities/link-preview'));
});

afterEach(async () => {
  if (requestedUrls.size > 0) {
    const { getLinkPreviewUrlHash } = await import('@kosmo/core/temporal/link-preview');
    await db
      .delete(LinkPreviews)
      .where(inArray(LinkPreviews.urlHash, [...requestedUrls].map(getLinkPreviewUrlHash)));
    requestedUrls.clear();
  }
  fetchedPreview = null;
  fetchLinkPreviewCalls = 0;
  fetchLinkPreviewInput = undefined;
});

after(async () => {
  await pg.end();
});

test(
  'Link Preview Workflow uses the production registry and persists success, failure, and backoff state',
  { timeout: 120_000 },
  async (t) => {
    const {
      LINK_PREVIEW_REFRESH_WORKFLOW_TYPE,
      getLinkPreviewUrlHash,
      linkPreviewRefreshWorkflow,
    } = await import('@kosmo/core/temporal/link-preview');
    const firstUrl = 'https://preview.example/article?source=post&keep=1#summary';
    const staleUrl = 'https://preview.example/stale';
    requestedUrls.add(firstUrl);
    requestedUrls.add(staleUrl);

    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-link-preview-${process.pid}`;
    const worker = await Worker.create({
      activities: { refreshLinkPreviewActivity },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      ...testWorkflowSource,
    });

    const runWorkflow = (input: LinkPreviewRefreshInput) =>
      environment.client.workflow.execute(LINK_PREVIEW_REFRESH_WORKFLOW_TYPE, {
        args: [input],
        taskQueue,
        workflowId: linkPreviewRefreshWorkflow.workflowIdFromArgs(input),
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });

    await worker.runUntil(async () => {
      const initialFailure = await runWorkflow({ url: firstUrl });
      assert.equal(initialFailure, null);
      assert.equal(fetchLinkPreviewCalls, 1);
      assert.equal(fetchLinkPreviewInput, firstUrl);

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

      assert.equal(await runWorkflow({ url: firstUrl }), null);
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

      const successResult = await runWorkflow({ url: firstUrl });
      assert.deepEqual(successResult, fetchedPreview);
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

      assert.deepEqual(await runWorkflow({ url: firstUrl }), fetchedPreview);
      assert.equal(fetchLinkPreviewCalls, 2, 'fresh successful metadata should prevent refetch');

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

      const staleInput = { url: staleUrl };
      const failedRefreshResult = await runWorkflow(staleInput);
      assert.deepEqual(failedRefreshResult, {
        url: staleUrl,
        title: previousMetadata.title,
        description: previousMetadata.description,
        imageUrl: previousMetadata.imageUrl,
      });
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

      assert.deepEqual(await runWorkflow(staleInput), failedRefreshResult);
      assert.equal(fetchLinkPreviewCalls, 3, 'recent failure should prevent another fetch');
    });
  },
);
