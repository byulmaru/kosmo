import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { db, Media } from '@kosmo/core/db';
import { MediaSource, MediaState, PostVisibility } from '@kosmo/core/enums';
import { mediaUploadWorkflow } from '@kosmo/core/temporal/media-upload';
import { POST_CREATE_WORKFLOW_V2_TYPE } from '@kosmo/core/temporal/post-create';
import {
  POST_REQUEST_CANCEL_UPDATE,
  POST_REQUEST_STATE_QUERY,
  POST_REQUEST_WORKFLOW_TYPE,
  PostRequestStatus,
  postRequestWorkflow,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  ApplicationFailure,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { getClient, startWorkflow, WorkflowRunOperationHandler } from '@temporalio/nexus';
import { Worker } from '@temporalio/worker';
import { PgDialect } from 'drizzle-orm/pg-core';
import { operation, service, serviceHandler } from 'nexus-rpc';
import { finalizeMediaUploadActivity, prepareMediaUploadActivity } from './activities/media-upload';
import { getPostRequestMediaStateActivity } from './activities/post-request';
import { mediaUploadServiceHandler } from './nexus/media-upload';
import { createTestWorkflowEnvironment, testWorkflowSource } from './temporal-test-environment.js';
import { createMediaUploadTestEndpoint } from './temporal-test-media-endpoint.js';
import {
  MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_CANCEL_SIGNAL,
  MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_FINISH_SIGNAL,
  MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL,
  MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL,
  mockMediaUploadNexusOperationWorkflow,
} from './test-fixtures/media-upload-nexus-operation';
import type { TestContext } from 'node:test';
import type { NexusMediaUploadContentType } from '@kosmo/core/media-upload';
import type { MediaUploadWorkflowResult } from '@kosmo/core/temporal/media-upload';
import type {
  PostCreateActivityInput,
  PostCreateActivityResult,
} from '@kosmo/core/temporal/post-create';
import type { PostRequestState, PostRequestWorkflowArgs } from '@kosmo/core/temporal/post-request';
import type { TestWorkflowEnvironment } from '@temporalio/testing';
import type { SQL } from 'drizzle-orm';
import type * as activities from './activities';
import type { capturePostCreatedActivity as CapturePostCreatedActivity } from './activities/post-created';

type CapturePostCreatedInput = Parameters<typeof CapturePostCreatedActivity>[0];
const mediaUploadNexusWorkflowPath = new URL(
  './test-fixtures/media-upload-nexus-operation.ts',
  import.meta.url,
).pathname;

const createPostRequest = (
  withMedia = false,
  submissionFingerprint?: string,
): PostRequestWorkflowArgs => {
  const mediaId = withMedia ? randomUUID() : undefined;
  return {
    input: {
      accountId: randomUUID(),
      bodyText: 'A local post',
      ...(mediaId ? { media: [{ altText: null, applyNightshade: true, mediaId }] } : {}),
      origin: 'LOCAL',
      profileId: randomUUID(),
      visibility: PostVisibility.PUBLIC,
    },
    postId: randomUUID(),
    requestId: randomUUID(),
    ...(submissionFingerprint === undefined ? {} : { submissionFingerprint }),
    submittedAt: '2026-10-29T00:00:00.000Z',
  };
};

const createPostRequestWithMedia = (mediaIds: readonly string[]): PostRequestWorkflowArgs => {
  const args = createPostRequest();
  return {
    ...args,
    input: {
      ...args.input,
      media: mediaIds.map((mediaId) => ({
        altText: null,
        applyNightshade: false,
        mediaId,
      })),
    },
  };
};

type LegacyPostRequestWorkflowArgs = Omit<PostRequestWorkflowArgs, 'input'> & {
  readonly input: Omit<PostRequestWorkflowArgs['input'], 'media'> & {
    readonly media?: readonly {
      readonly altText: string | null;
      readonly mediaId: string;
    }[];
  };
  readonly mediaProcessing: readonly {
    readonly applyNightshade: boolean;
    readonly mediaId: string;
  }[];
};

const withoutPostId = (args: PostRequestWorkflowArgs): PostRequestWorkflowArgs => {
  const { postId, ...snapshot } = args;
  assert.ok(postId);
  return snapshot;
};

const createWorker = (
  environment: TestWorkflowEnvironment,
  taskQueue: string,
  workerActivities: Partial<typeof activities>,
  options: {
    readonly maxConcurrentActivityTaskExecutions?: number;
    readonly nexusServices?: (typeof mediaUploadServiceHandler)[];
  } = {},
) =>
  Worker.create({
    activities: workerActivities,
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    taskQueue,
    ...testWorkflowSource,
    ...options,
  });

const startPostRequest = (
  environment: TestWorkflowEnvironment,
  taskQueue: string,
  args: PostRequestWorkflowArgs,
) =>
  environment.client.workflow.start(POST_REQUEST_WORKFLOW_TYPE, {
    args: [args],
    taskQueue,
    workflowId: postRequestWorkflow.workflowIdFromArgs(args),
  });

type RunningTestWorker = { readonly worker: Worker; readonly workerRun: Promise<void> };

const stopWorkers = async (workers: readonly RunningTestWorker[]): Promise<void> => {
  const shutdowns = await Promise.allSettled(
    workers.map(async ({ worker }) => {
      if (worker.getState() === 'RUNNING') {
        await worker.shutdown();
      }
    }),
  );
  const runs = await Promise.allSettled(workers.map(({ workerRun }) => workerRun));
  const failures = [...shutdowns, ...runs].flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Test worker shutdown failed');
  }
};

const registerTestCleanup = (
  t: TestContext,
  environment: TestWorkflowEnvironment,
  releaseGates: readonly (() => void)[] = [],
  workers: RunningTestWorker[] = [],
  resourceCleanups: readonly (() => Promise<void>)[] = [],
): void => {
  t.after(async () => {
    releaseGates.forEach((release) => release());
    const failures: unknown[] = [];
    const stopResults = await Promise.allSettled([stopWorkers(workers)]);
    const resourceCleanupResults = await Promise.allSettled(
      resourceCleanups.map((cleanup) => cleanup()),
    );
    const teardownResults = await Promise.allSettled([environment.teardown()]);
    failures.push(
      ...stopResults.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ...resourceCleanupResults.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      ),
      ...teardownResults.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Post Request test cleanup failed');
    }
  });
};

const waitFor = async <T>(promise: Promise<T>, label: string, timeoutMs = 10_000): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};

const waitForCondition = async (
  condition: () => Promise<boolean>,
  label: string,
  timeoutMs = 10_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await waitFor(condition(), label, deadline - Date.now())) {
      return;
    }
    await waitFor(
      new Promise<void>((resolve) => setTimeout(resolve, 25)),
      label,
      deadline - Date.now(),
    );
  }
  throw new Error(`Timed out waiting for ${label}`);
};

type PostRequestWorkflowHandle = Awaited<ReturnType<typeof startPostRequest>>;

const waitForScheduledNexusOperations = async (
  handle: PostRequestWorkflowHandle,
  expectedCount: number,
) => {
  const getOperations = async () => {
    const history = await handle.fetchHistory();
    return (history.events ?? []).flatMap(({ nexusOperationScheduledEventAttributes }) =>
      nexusOperationScheduledEventAttributes == null
        ? []
        : [nexusOperationScheduledEventAttributes],
    );
  };
  let operations = await getOperations();
  await waitForCondition(async () => {
    operations = await getOperations();
    return operations.length >= expectedCount;
  }, `the ${expectedCount} scheduled Nexus operation(s) for ${handle.workflowId}`);
  return operations;
};

const waitForStartedNexusOperations = async (
  handle: PostRequestWorkflowHandle,
  expectedCount: number,
): Promise<number> => {
  let startedCount = 0;
  const getStartedCount = async () => {
    const history = await handle.fetchHistory();
    return (history.events ?? []).filter(
      ({ nexusOperationStartedEventAttributes }) => nexusOperationStartedEventAttributes != null,
    ).length;
  };
  startedCount = await getStartedCount();
  await waitForCondition(async () => {
    startedCount = await getStartedCount();
    return startedCount >= expectedCount;
  }, `the ${expectedCount} started Nexus operation(s) for ${handle.workflowId}`);
  return startedCount;
};

const startLegacyPostRequest = (
  environment: TestWorkflowEnvironment,
  taskQueue: string,
  args: LegacyPostRequestWorkflowArgs,
) =>
  environment.client.workflow.start(POST_REQUEST_WORKFLOW_TYPE, {
    args: [args],
    taskQueue,
    workflowId: postRequestWorkflowId(args.input.accountId, args.requestId),
  });

type MediaUploadTestStartInput = {
  readonly contentType: NexusMediaUploadContentType;
  readonly generateAltText?: boolean;
  readonly id: string;
  readonly maxBytes: number;
  readonly maxDimension: number;
  readonly sourceKey: string;
};

const mediaUploadTestService = service('media', {
  startUpload: operation<MediaUploadTestStartInput, MediaUploadWorkflowResult>(),
  applyHope: operation<
    {
      readonly id: string;
      readonly hope: {
        readonly algorithm: string;
        readonly iterations: number;
        readonly intensity: number;
      };
    },
    { readonly id: string }
  >(),
  publishUpload: operation<{ readonly id: string }, { readonly id: string }>(),
});

const createMediaUploadTestNexusWorker = async (
  environment: TestWorkflowEnvironment,
  taskQueue: string,
  appliedNightshadeUploadIds: string[],
  options: {
    readonly beforePublish?: (uploadId: string) => Promise<void>;
    readonly onStartUpload?: (uploadId: string) => void;
    readonly onGenerateAltText?: (input: MediaUploadTestStartInput) => void;
    readonly shouldFail?: boolean | ((uploadId: string) => boolean);
  } = {},
) => {
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    nexusServices: [
      serviceHandler(mediaUploadTestService, {
        startUpload: new WorkflowRunOperationHandler<
          MediaUploadTestStartInput,
          MediaUploadWorkflowResult
        >(async (context, input) => {
          options.onStartUpload?.(input.id);
          if (input.generateAltText === true) {
            options.onGenerateAltText?.(input);
          }
          return startWorkflow(context, mockMediaUploadNexusOperationWorkflow, {
            args: [
              {
                result: {
                  id: input.id,
                  mediaType: 'image/jpeg',
                  url: 'https://media.example/' + input.id + '.jpg',
                  ...(input.generateAltText === true
                    ? { altText: 'Generated caption ' + input.id }
                    : {}),
                },
                shouldFail:
                  typeof options.shouldFail === 'function'
                    ? options.shouldFail(input.id)
                    : (options.shouldFail ?? false),
              },
            ],
            workflowExecutionTimeout: '25 hours',
            workflowId: 'mock-media-upload:' + input.id,
          });
        }),
        applyHope: async (_context, { id }) => {
          appliedNightshadeUploadIds.push(id);
          return { id };
        },
        publishUpload: async (_context, { id }) => {
          await options.beforePublish?.(id);
          const operation = getClient().workflow.getHandle('mock-media-upload:' + id);
          await operation.signal(MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL);
          await operation.signal(MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL);
          return { id };
        },
      }),
    ],
    taskQueue,
    workflowsPath: mediaUploadNexusWorkflowPath,
  });
  const workerRun = worker.run();
  void workerRun.catch(() => undefined);
  return { worker, workerRun };
};

const createMediaUploadNexusEndpoints = async (
  environment: TestWorkflowEnvironment,
  signal: AbortSignal,
  resourceCleanups: Array<() => Promise<void>>,
) => {
  const remoteTaskQueue = `post-request-remote-media-${process.pid}-${randomUUID()}`;
  const namespaceEndpoint = await environment.createNexusEndpoint(
    `${environment.namespace}-media-upload`,
    KOSMO_TASK_QUEUE,
  );
  resourceCleanups.push(() => environment.deleteNexusEndpoint(namespaceEndpoint));
  const mediaUploadEndpoint = await createMediaUploadTestEndpoint(
    environment,
    remoteTaskQueue,
    signal,
  );
  resourceCleanups.push(mediaUploadEndpoint.dispose);
  return remoteTaskQueue;
};

type PostRequestMediaRow = {
  readonly accountId: string;
  readonly altText?: string | null;
  readonly id: string;
  readonly mediaType?: string | null;
  readonly source: MediaSource;
  readonly state: MediaState;
  readonly storageReference?: string | null;
  readonly url?: string | null;
};

const createPostRequestMediaRows = (
  accountId: string,
  mediaStates: readonly (readonly [string, MediaState])[],
): Map<string, PostRequestMediaRow> =>
  new Map(
    mediaStates.map(
      ([id, state]) => [id, { accountId, id, source: MediaSource.LOCAL, state }] as const,
    ),
  );

const mockPostRequestMediaDatabase = (
  t: TestContext,
  mediaRows: Map<string, PostRequestMediaRow>,
): { readonly finalizationCount: () => number } => {
  let finalizationCount = 0;
  t.mock.method(db, 'select', (selection: unknown) => {
    let queriedMediaIds: readonly string[] = [];
    let queriedAccountIds: readonly string[] = [];
    const requiresAccountScope =
      selection !== undefined && !('accountId' in (selection as Record<string, unknown>));
    const query = {
      from: (table: unknown) => {
        assert.equal(table, Media);
        return query;
      },
      where: (condition: unknown) => {
        const params = new PgDialect().sqlToQuery(condition as SQL).params;
        queriedAccountIds = [
          ...new Set([...mediaRows.values()].map(({ accountId }) => accountId)),
        ].filter((accountId) => params.includes(accountId));
        queriedMediaIds = [...mediaRows.keys()].filter((mediaId) => params.includes(mediaId));
        assert.ok(queriedMediaIds.length > 0, 'the Media lookup is scoped to its IDs');
        if (requiresAccountScope) {
          assert.ok(queriedAccountIds.length > 0, 'the Media lookup is scoped to its Account');
        }
        return query;
      },
      limit: () => query,
      then: (
        resolve: (rows: PostRequestMediaRow[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve(
          [...mediaRows.values()].filter(
            ({ accountId, id }) =>
              queriedMediaIds.includes(id) &&
              (!requiresAccountScope || queriedAccountIds.includes(accountId)),
          ),
        ).then(resolve, reject),
    };
    return query as never;
  });

  t.mock.method(db, 'update', (table: unknown) => {
    assert.equal(table, Media);
    let values: Record<string, unknown> = {};
    let params: readonly unknown[] = [];
    const query = {
      set: (input: Record<string, unknown>) => {
        values = input;
        return query;
      },
      where: (condition: unknown) => {
        params = new PgDialect().sqlToQuery(condition as SQL).params;
        return query;
      },
      returning: () => ({
        then: (
          resolve: (rows: { readonly id: string }[]) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => {
          const id = [...mediaRows.keys()].find((mediaId) => params.includes(mediaId));
          const current = id === undefined ? undefined : mediaRows.get(id);
          if (
            id === undefined ||
            current === undefined ||
            current.state !== MediaState.UPLOADING ||
            !params.includes(current.accountId) ||
            current.storageReference === undefined ||
            !params.includes(current.storageReference)
          ) {
            return Promise.resolve([]).then(resolve, reject);
          }

          finalizationCount += 1;
          mediaRows.set(id, {
            ...current,
            mediaType: values.mediaType as string,
            state: MediaState.READY,
            url: values.url as string,
          });
          return Promise.resolve([{ id }]).then(resolve, reject);
        },
      }),
    };
    return query as never;
  });

  return { finalizationCount: () => finalizationCount };
};

const committedPost = (input: PostCreateActivityInput): PostCreateActivityResult => ({
  ok: true,
  result: {
    authorProfileId: input.input.profileId,
    postId: input.postId,
    status: 'created',
  },
});

const postCreateEffectsActivities = {
  createNotificationActivity: async () => {},
  createReplyNotificationActivity: async () => [],
  fanoutHomeTimelinePostActivity: async () => {},
  loadHomeTimelineRecipientPageActivity: async () => ({ profileIds: [], nextCursor: null }),
  insertHomeTimelinePostActivity: async () => undefined,
  sendLocalPostCreateActivity: async () => {},
};

const createPostRequestTestEnvironment = () => createTestWorkflowEnvironment();

const createMockMediaUploadActivities = (
  mediaRows: Map<string, PostRequestMediaRow>,
  onPrepare: (input: Parameters<typeof prepareMediaUploadActivity>[0]) => void = () => {},
  onFinalize: (input: Parameters<typeof finalizeMediaUploadActivity>[0]) => void = () => {},
) => ({
  prepareMediaUploadActivity: async (input: Parameters<typeof prepareMediaUploadActivity>[0]) => {
    onPrepare(input);
    return {
      contentType: 'image/jpeg' as const,
      id: `u_${input.mediaId}`,
      sourceKey: `uploads/${input.mediaId}`,
    };
  },
  finalizeMediaUploadActivity: async (input: Parameters<typeof finalizeMediaUploadActivity>[0]) => {
    onFinalize(input);
    const media = mediaRows.get(input.mediaId);
    assert.ok(media);
    mediaRows.set(input.mediaId, {
      ...media,
      ...(input.result.altText === undefined ? {} : { altText: input.result.altText }),
      state: MediaState.READY,
    });
    return input.result;
  },
});

const createParallelMediaUploadHarness = async (
  t: TestContext,
  environment: TestWorkflowEnvironment,
  mediaRows: Map<string, PostRequestMediaRow>,
  options: {
    readonly beforePublish: (uploadId: string) => Promise<void>;
    readonly releaseGates: readonly (() => void)[];
    readonly onGenerateAltText?: (input: MediaUploadTestStartInput) => void;
    readonly shouldFail?: boolean | ((uploadId: string) => boolean);
  },
) => {
  const remoteWorkers: RunningTestWorker[] = [];
  const resourceCleanups: Array<() => Promise<void>> = [];
  registerTestCleanup(t, environment, options.releaseGates, remoteWorkers, resourceCleanups);
  mockPostRequestMediaDatabase(t, mediaRows);

  const startedUploadIds: string[] = [];
  const remoteTaskQueue = await createMediaUploadNexusEndpoints(
    environment,
    t.signal,
    resourceCleanups,
  );
  remoteWorkers.push(
    await createMediaUploadTestNexusWorker(environment, remoteTaskQueue, [], {
      beforePublish: options.beforePublish,
      onStartUpload: (uploadId) => startedUploadIds.push(uploadId),
      onGenerateAltText: options.onGenerateAltText,
      shouldFail: options.shouldFail,
    }),
  );

  const postCreateInputs: PostCreateActivityInput[] = [];
  const worker = await createWorker(
    environment,
    KOSMO_TASK_QUEUE,
    {
      ...postCreateEffectsActivities,
      ...createMockMediaUploadActivities(mediaRows),
      createPostActivityV2: async (input) => {
        postCreateInputs.push(input);
        return committedPost(input);
      },
      getPostRequestMediaStateActivity,
    },
    { nexusServices: [mediaUploadServiceHandler] },
  );

  return { postCreateInputs, startedUploadIds, worker };
};

test(
  'Post Requests share the independently started Media Upload through Nexus with one Activity slot',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    const releasePublish = Promise.withResolvers<void>();
    const remoteWorkers: RunningTestWorker[] = [];
    const resourceCleanups: Array<() => Promise<void>> = [];
    registerTestCleanup(
      t,
      environment,
      [() => releasePublish.resolve()],
      remoteWorkers,
      resourceCleanups,
    );

    const originalArgs = createPostRequest(true);
    const args: PostRequestWorkflowArgs = {
      ...originalArgs,
      input: {
        ...originalArgs.input,
        media: originalArgs.input.media?.map((media) => ({ ...media, generateAltText: true })),
      },
    };
    const mediaId = args.input.media![0]!.mediaId;
    const mediaRows = new Map<string, PostRequestMediaRow>([
      [
        mediaId,
        {
          accountId: args.input.accountId,
          id: mediaId,
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
          storageReference: `nexus:v1:${mediaId}`,
        },
      ],
    ]);
    const database = mockPostRequestMediaDatabase(t, mediaRows);
    const mediaStorageHeadCalls = { count: 0 };
    const previousMediaStorageOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
    const previousMediaStorageApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
    process.env.MEDIA_STORAGE_SERVICE_ORIGIN = 'https://media-storage.example';
    process.env.MEDIA_STORAGE_SERVICE_API_KEY = 'test-api-key';
    t.mock.method(globalThis, 'fetch', async () => {
      mediaStorageHeadCalls.count += 1;
      return new Response(null, {
        headers: {
          'content-length': '1024',
          'content-type': 'image/jpeg',
          'last-modified': new Date().toUTCString(),
        },
        status: 200,
      });
    });

    const publishStarted = Promise.withResolvers<void>();
    const appliedNightshadeUploadIds: string[] = [];
    const generatedUploadInputs: MediaUploadTestStartInput[] = [];
    const remoteTaskQueue = await createMediaUploadNexusEndpoints(
      environment,
      t.signal,
      resourceCleanups,
    );
    remoteWorkers.push(
      await createMediaUploadTestNexusWorker(
        environment,
        remoteTaskQueue,
        appliedNightshadeUploadIds,
        {
          beforePublish: async () => {
            publishStarted.resolve();
            await releasePublish.promise;
          },
          onGenerateAltText: (input) => generatedUploadInputs.push(input),
        },
      ),
    );

    const postCreateInputs: PostCreateActivityInput[] = [];
    const worker = await createWorker(
      environment,
      KOSMO_TASK_QUEUE,
      {
        ...postCreateEffectsActivities,
        createPostActivityV2: async (input) => {
          assert.equal(mediaRows.get(mediaId)?.state, MediaState.READY);
          postCreateInputs.push(input);
          return committedPost(input);
        },
        generatePostIdActivity: async () => randomUUID(),
        getPostRequestMediaStateActivity,
        prepareMediaUploadActivity,
        finalizeMediaUploadActivity,
      },
      {
        maxConcurrentActivityTaskExecutions: 1,
        nexusServices: [mediaUploadServiceHandler],
      },
    );

    try {
      await worker.runUntil(async () => {
        const uploadInput = {
          accountId: args.input.accountId,
          applyNightshade: true,
          mediaId,
        };
        const uploadHandle = await environment.client.workflow.start(mediaUploadWorkflow.workflow, {
          args: [uploadInput],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: mediaUploadWorkflow.workflowIdFromArgs(uploadInput),
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
          workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
        });

        try {
          await waitFor(publishStarted.promise, 'the remote Media publish gate');
          assert.equal((await uploadHandle.describe()).status.name, 'RUNNING');

          const joinerArgs = Array.from({ length: 2 }, () => ({
            ...withoutPostId(args),
            requestId: randomUUID(),
          }));
          const handles = await Promise.all(
            [args, ...joinerArgs].map((postArgs) =>
              startPostRequest(environment, KOSMO_TASK_QUEUE, postArgs),
            ),
          );
          const scheduledOperations = await Promise.all(
            handles.map((handle) => waitForScheduledNexusOperations(handle, 1)),
          );
          const startedOperations = await Promise.all(
            handles.map((handle) => waitForStartedNexusOperations(handle, 1)),
          );

          assert.deepEqual(
            scheduledOperations.map((operations) => operations.length),
            [1, 1, 1],
          );
          assert.deepEqual(startedOperations, [1, 1, 1]);
          assert.equal(mediaStorageHeadCalls.count, 1);
          assert.equal(database.finalizationCount(), 0);
          assert.equal(mediaRows.get(mediaId)?.state, MediaState.UPLOADING);
          assert.deepEqual(appliedNightshadeUploadIds, [`u_${mediaId}`]);
          assert.deepEqual(generatedUploadInputs, []);

          releasePublish.resolve();
          const [uploadResult, ...results] = await Promise.all([
            waitFor(uploadHandle.result(), 'independent Media Upload result'),
            ...handles.map((handle, index) =>
              waitFor(handle.result(), `Post Request ${index + 1} publication`),
            ),
          ]);
          assert.equal(uploadResult.id, `u_${mediaId}`);
          assert.ok(results.every(({ status }) => status === PostRequestStatus.PUBLISHED));
          for (const handle of handles) {
            const history = await handle.fetchHistory();
            const events = history.events ?? [];
            assert.equal(
              events.some(
                ({ startChildWorkflowExecutionInitiatedEventAttributes }) =>
                  startChildWorkflowExecutionInitiatedEventAttributes?.workflowType?.name ===
                  mediaUploadWorkflow.workflow,
              ),
              false,
            );
            assert.equal(
              events.some(({ activityTaskScheduledEventAttributes }) =>
                [
                  'checkPostRequestMediaUploadActivity',
                  'waitForPostRequestMediaUploadActivity',
                ].includes(activityTaskScheduledEventAttributes?.activityType?.name ?? ''),
              ),
              false,
            );
          }
          assert.equal(database.finalizationCount(), 1);
          assert.equal(mediaRows.get(mediaId)?.state, MediaState.READY);
          assert.equal(mediaRows.get(mediaId)?.altText, undefined);
          assert.equal(postCreateInputs.length, 3);
          assert.ok(
            postCreateInputs.every(
              ({ input }) => input.origin === 'LOCAL' && input.media?.[0]?.generateAltText === true,
            ),
          );
          assert.equal(new Set(postCreateInputs.map(({ postId }) => postId)).size, 3);
        } finally {
          releasePublish.resolve();
        }
      });
    } finally {
      releasePublish.resolve();
      if (previousMediaStorageOrigin === undefined) {
        delete process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
      } else {
        process.env.MEDIA_STORAGE_SERVICE_ORIGIN = previousMediaStorageOrigin;
      }
      if (previousMediaStorageApiKey === undefined) {
        delete process.env.MEDIA_STORAGE_SERVICE_API_KEY;
      } else {
        process.env.MEDIA_STORAGE_SERVICE_API_KEY = previousMediaStorageApiKey;
      }
    }
  },
);

test(
  'Post Request starts pending Media uploads together and preserves attachment order',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    const firstMediaId = randomUUID();
    const readyMediaId = randomUUID();
    const secondMediaId = randomUUID();
    const originalArgs = createPostRequestWithMedia([firstMediaId, readyMediaId, secondMediaId]);
    const args: PostRequestWorkflowArgs = {
      ...originalArgs,
      input: {
        ...originalArgs.input,
        media: originalArgs.input.media?.map((media) =>
          media.mediaId === firstMediaId ? { ...media, generateAltText: true } : media,
        ),
      },
    };
    const pendingMediaIds = [firstMediaId, secondMediaId];
    const pendingUploadIds = pendingMediaIds.map((mediaId) => `u_${mediaId}`);
    const publishStarted = new Map<string, PromiseWithResolvers<void>>(
      pendingUploadIds.map((uploadId) => [uploadId, Promise.withResolvers<void>()] as const),
    );
    const releasePublish = new Map<string, PromiseWithResolvers<void>>(
      pendingUploadIds.map((uploadId) => [uploadId, Promise.withResolvers<void>()] as const),
    );
    const mediaRows = createPostRequestMediaRows(args.input.accountId, [
      [firstMediaId, MediaState.UPLOADING],
      [readyMediaId, MediaState.READY],
      [secondMediaId, MediaState.UPLOADING],
    ]);
    const expectedPostMedia = args.input.media?.map(({ altText, generateAltText, mediaId }) => ({
      altText,
      ...(generateAltText === undefined ? {} : { generateAltText }),
      mediaId,
    }));
    const generatedUploadInputs: MediaUploadTestStartInput[] = [];
    const { postCreateInputs, startedUploadIds, worker } = await createParallelMediaUploadHarness(
      t,
      environment,
      mediaRows,
      {
        beforePublish: async (uploadId) => {
          publishStarted.get(uploadId)?.resolve();
          await releasePublish.get(uploadId)?.promise;
        },
        releaseGates: [...releasePublish.values()].map(
          ({ resolve }) =>
            () =>
              resolve(),
        ),
        onGenerateAltText: (input) => generatedUploadInputs.push(input),
      },
    );

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, KOSMO_TASK_QUEUE, args);
      assert.equal((await waitForScheduledNexusOperations(handle, 2)).length, 2);
      assert.equal(await waitForStartedNexusOperations(handle, 2), 2);
      await Promise.all(
        pendingUploadIds.map((uploadId) =>
          waitFor(publishStarted.get(uploadId)!.promise, `${uploadId} publish gate`),
        ),
      );

      assert.deepEqual(startedUploadIds.toSorted(), pendingUploadIds.toSorted());
      assert.deepEqual(
        generatedUploadInputs.map(({ id, generateAltText }) => ({ id, generateAltText })),
        [{ id: `u_${firstMediaId}`, generateAltText: true }],
      );
      assert.equal(
        (await handle.query<PostRequestState>(POST_REQUEST_STATE_QUERY)).status,
        PostRequestStatus.PROCESSING,
      );
      assert.equal(postCreateInputs.length, 0);

      const firstUpload = environment.client.workflow.getHandle(
        mediaUploadWorkflow.workflowIdFromArgs({
          accountId: args.input.accountId,
          mediaId: firstMediaId,
        }),
      );
      const secondUpload = environment.client.workflow.getHandle(
        mediaUploadWorkflow.workflowIdFromArgs({
          accountId: args.input.accountId,
          mediaId: secondMediaId,
        }),
      );
      releasePublish.get(`u_${secondMediaId}`)!.resolve();
      assert.equal(
        (await waitFor(secondUpload.result(), 'second Media Upload completion')).id,
        `u_${secondMediaId}`,
      );
      assert.equal((await firstUpload.describe()).status.name, 'RUNNING');
      assert.equal(mediaRows.get(secondMediaId)?.state, MediaState.READY);
      assert.equal(
        (await handle.query<PostRequestState>(POST_REQUEST_STATE_QUERY)).status,
        PostRequestStatus.PROCESSING,
      );
      assert.equal(postCreateInputs.length, 0);

      releasePublish.get(`u_${firstMediaId}`)!.resolve();
      const [firstResult, result] = await Promise.all([
        waitFor(firstUpload.result(), 'first Media Upload completion'),
        waitFor<PostRequestState>(handle.result(), 'Post Request publication'),
      ]);
      assert.equal(firstResult.id, `u_${firstMediaId}`);
      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.deepEqual(
        postCreateInputs.map(({ input }) => input.media),
        [expectedPostMedia],
      );
      assert.deepEqual(
        result.snapshot.input.media?.map(({ mediaId }) => mediaId),
        [firstMediaId, readyMediaId, secondMediaId],
      );
      assert.equal(mediaRows.get(firstMediaId)?.state, MediaState.READY);
      assert.equal(mediaRows.get(firstMediaId)?.altText, `Generated caption u_${firstMediaId}`);
      assert.equal(mediaRows.get(readyMediaId)?.state, MediaState.READY);
      assert.equal(mediaRows.get(secondMediaId)?.state, MediaState.READY);
      assert.equal(
        result.snapshot.input.media?.find(({ mediaId }) => mediaId === firstMediaId)
          ?.generateAltText,
        true,
      );
    });
  },
);

test(
  'Post Request waits for every started Media upload after one fails',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    const failedMediaId = randomUUID();
    const pendingMediaId = randomUUID();
    const args = createPostRequestWithMedia([failedMediaId, pendingMediaId]);
    const failedUploadId = `u_${failedMediaId}`;
    const pendingUploadId = `u_${pendingMediaId}`;
    const publishStarted = new Map<string, PromiseWithResolvers<void>>(
      [failedUploadId, pendingUploadId].map(
        (uploadId) => [uploadId, Promise.withResolvers<void>()] as const,
      ),
    );
    const releasePending = Promise.withResolvers<void>();
    const mediaRows = createPostRequestMediaRows(args.input.accountId, [
      [failedMediaId, MediaState.UPLOADING],
      [pendingMediaId, MediaState.UPLOADING],
    ]);
    const { postCreateInputs, startedUploadIds, worker } = await createParallelMediaUploadHarness(
      t,
      environment,
      mediaRows,
      {
        beforePublish: async (uploadId) => {
          publishStarted.get(uploadId)?.resolve();
          if (uploadId === pendingUploadId) {
            await releasePending.promise;
          }
        },
        releaseGates: [() => releasePending.resolve()],
        shouldFail: (uploadId) => uploadId === failedUploadId,
      },
    );

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, KOSMO_TASK_QUEUE, args);
      assert.equal((await waitForScheduledNexusOperations(handle, 2)).length, 2);
      assert.equal(await waitForStartedNexusOperations(handle, 2), 2);
      await Promise.all(
        [failedUploadId, pendingUploadId].map((uploadId) =>
          waitFor(publishStarted.get(uploadId)!.promise, `${uploadId} publish gate`),
        ),
      );
      assert.deepEqual(startedUploadIds.toSorted(), [failedUploadId, pendingUploadId].toSorted());

      const failedUpload = environment.client.workflow.getHandle(
        mediaUploadWorkflow.workflowIdFromArgs({
          accountId: args.input.accountId,
          mediaId: failedMediaId,
        }),
      );
      const pendingUpload = environment.client.workflow.getHandle(
        mediaUploadWorkflow.workflowIdFromArgs({
          accountId: args.input.accountId,
          mediaId: pendingMediaId,
        }),
      );
      const failure = await waitFor(
        failedUpload.result(),
        'failed Media Upload workflow result',
      ).then(
        () => assert.fail('The selected Media Upload must fail'),
        (error: unknown) => error,
      );
      assert.ok(failure instanceof Error);

      await waitForCondition(async () => {
        const history = await handle.fetchHistory();
        const events = history.events ?? [];
        const failedOperationIndex = events.findIndex(
          ({ nexusOperationFailedEventAttributes }) => nexusOperationFailedEventAttributes != null,
        );
        const mediaStateLookups = events.flatMap((event, index) =>
          event.activityTaskScheduledEventAttributes?.activityType?.name ===
          'getPostRequestMediaStateActivity'
            ? [{ eventId: event.eventId?.toString(), index }]
            : [],
        );
        const recoveryLookup = mediaStateLookups[1];
        if (
          failedOperationIndex < 0 ||
          recoveryLookup?.eventId === undefined ||
          recoveryLookup.index <= failedOperationIndex
        ) {
          return false;
        }

        const recoveryCompleted = events.find(
          (event) =>
            event.activityTaskCompletedEventAttributes?.scheduledEventId?.toString() ===
            recoveryLookup.eventId,
        );
        const recoveryCompletedEventId = recoveryCompleted?.eventId?.toString();
        if (recoveryCompletedEventId === undefined) {
          return false;
        }

        return events.some(
          (event) =>
            event.workflowTaskCompletedEventAttributes != null &&
            event.eventId != null &&
            BigInt(event.eventId.toString()) > BigInt(recoveryCompletedEventId),
        );
      }, 'the recovery lookup and following workflow task after the Media failure');
      assert.equal((await pendingUpload.describe()).status.name, 'RUNNING');
      assert.equal(
        (await handle.query<PostRequestState>(POST_REQUEST_STATE_QUERY)).status,
        PostRequestStatus.PROCESSING,
      );
      assert.equal(postCreateInputs.length, 0);

      releasePending.resolve();
      const [pendingResult, result] = await Promise.all([
        waitFor(pendingUpload.result(), 'remaining Media Upload completion'),
        waitFor(handle.result(), 'failed Post Request completion'),
      ]);
      assert.equal(pendingResult.id, pendingUploadId);
      assert.equal(result.status, PostRequestStatus.FAILED);
      assert.equal(mediaRows.get(failedMediaId)?.state, MediaState.UPLOADING);
      assert.equal(mediaRows.get(pendingMediaId)?.state, MediaState.READY);
      assert.equal(postCreateInputs.length, 0);
    });
  },
);

test(
  'Post Request cancellation detaches every pending upload wait and leaves shared uploads running',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    const mediaIds = [randomUUID(), randomUUID()];
    const args = createPostRequestWithMedia(mediaIds);
    const uploadIds = mediaIds.map((mediaId) => `u_${mediaId}`);
    const publishStarted = new Map<string, PromiseWithResolvers<void>>(
      uploadIds.map((uploadId) => [uploadId, Promise.withResolvers<void>()] as const),
    );
    const releasePublish = new Map<string, PromiseWithResolvers<void>>(
      uploadIds.map((uploadId) => [uploadId, Promise.withResolvers<void>()] as const),
    );
    const mediaRows = createPostRequestMediaRows(
      args.input.accountId,
      mediaIds.map((id) => [id, MediaState.UPLOADING] as const),
    );
    const { postCreateInputs, startedUploadIds, worker } = await createParallelMediaUploadHarness(
      t,
      environment,
      mediaRows,
      {
        beforePublish: async (uploadId) => {
          publishStarted.get(uploadId)?.resolve();
          await releasePublish.get(uploadId)?.promise;
        },
        releaseGates: [...releasePublish.values()].map(
          ({ resolve }) =>
            () =>
              resolve(),
        ),
      },
    );

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, KOSMO_TASK_QUEUE, args);
      assert.equal((await waitForScheduledNexusOperations(handle, 2)).length, 2);
      assert.equal(await waitForStartedNexusOperations(handle, 2), 2);
      await Promise.all(
        uploadIds.map((uploadId) =>
          waitFor(publishStarted.get(uploadId)!.promise, `${uploadId} publish gate`),
        ),
      );
      assert.deepEqual(startedUploadIds.toSorted(), uploadIds.toSorted());

      const uploadHandles = mediaIds.map((mediaId) =>
        environment.client.workflow.getHandle(
          mediaUploadWorkflow.workflowIdFromArgs({ accountId: args.input.accountId, mediaId }),
        ),
      );
      const cancelled = await handle.executeUpdate<PostRequestState, []>(
        POST_REQUEST_CANCEL_UPDATE,
        { args: [] },
      );
      assert.equal(cancelled.status, PostRequestStatus.CANCELLED);
      assert.equal(
        (await waitFor(handle.result(), 'cancelled Post Request', 3_000)).status,
        PostRequestStatus.CANCELLED,
      );
      assert.deepEqual(
        await Promise.all(
          uploadHandles.map(async (upload) => (await upload.describe()).status.name),
        ),
        ['RUNNING', 'RUNNING'],
      );
      assert.equal(postCreateInputs.length, 0);

      releasePublish.forEach(({ resolve }) => resolve());
      const results = await Promise.all(
        uploadHandles.map((upload, index) =>
          waitFor(upload.result(), `independent Media Upload ${index + 1} completion`),
        ),
      );
      assert.deepEqual(
        results.map(({ id }) => id),
        uploadIds,
      );
      assert.ok(mediaIds.every((mediaId) => mediaRows.get(mediaId)?.state === MediaState.READY));
      assert.equal(postCreateInputs.length, 0);
    });
  },
);

test(
  'Post Request callers cancel without cancelling their shared Media Upload',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    const releasePublish = Promise.withResolvers<void>();
    const remoteWorkers: RunningTestWorker[] = [];
    const resourceCleanups: Array<() => Promise<void>> = [];
    registerTestCleanup(
      t,
      environment,
      [() => releasePublish.resolve()],
      remoteWorkers,
      resourceCleanups,
    );

    const args = createPostRequest(true);
    const mediaId = args.input.media![0]!.mediaId;
    const mediaRows = new Map<string, PostRequestMediaRow>([
      [
        mediaId,
        {
          accountId: args.input.accountId,
          id: mediaId,
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
        },
      ],
    ]);
    mockPostRequestMediaDatabase(t, mediaRows);

    const publishStarted = Promise.withResolvers<void>();
    const appliedNightshadeUploadIds: string[] = [];
    const remoteTaskQueue = await createMediaUploadNexusEndpoints(
      environment,
      t.signal,
      resourceCleanups,
    );
    remoteWorkers.push(
      await createMediaUploadTestNexusWorker(
        environment,
        remoteTaskQueue,
        appliedNightshadeUploadIds,
        {
          beforePublish: async () => {
            publishStarted.resolve();
            await releasePublish.promise;
          },
        },
      ),
    );
    let prepareCalls = 0;
    let finalizeCalls = 0;
    const postCreateIds: string[] = [];
    const worker = await createWorker(
      environment,
      KOSMO_TASK_QUEUE,
      {
        ...postCreateEffectsActivities,
        ...createMockMediaUploadActivities(
          mediaRows,
          () => {
            prepareCalls += 1;
          },
          () => {
            finalizeCalls += 1;
          },
        ),
        createPostActivityV2: async (input) => {
          postCreateIds.push(input.postId);
          return committedPost(input);
        },
        generatePostIdActivity: async () => randomUUID(),
        getPostRequestMediaStateActivity,
      },
      { nexusServices: [mediaUploadServiceHandler] },
    );

    await worker.runUntil(async () => {
      try {
        const creatorHandle = await startPostRequest(environment, KOSMO_TASK_QUEUE, args);
        await waitFor(publishStarted.promise, 'the creator Post Request Media publish gate');
        const uploadHandle = environment.client.workflow.getHandle(
          mediaUploadWorkflow.workflowIdFromArgs({ accountId: args.input.accountId, mediaId }),
        );
        const mediaInput = args.input.media![0]!;
        const cancelProbe = await waitFor(
          environment.client.workflow.start('mediaUploadNexusCancelProbeWorkflow', {
            args: [
              {
                accountId: args.input.accountId,
                mediaId,
                ...(mediaInput.applyNightshade === undefined
                  ? {}
                  : { applyNightshade: mediaInput.applyNightshade }),
              },
            ],
            taskQueue: remoteTaskQueue,
            workflowId: `media-upload-cancel-probe:${randomUUID()}`,
          }),
          'workflow-backed Nexus cancellation probe start',
        );
        let cancelProbeFinished = false;
        try {
          await waitForCondition(async () => {
            const history = await cancelProbe.fetchHistory();
            return (history.events ?? []).some(
              ({ nexusOperationStartedEventAttributes }) =>
                nexusOperationStartedEventAttributes != null,
            );
          }, 'the cancellation probe Nexus operation to start');
          await waitFor(
            cancelProbe.signal(MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_CANCEL_SIGNAL),
            'the cancellation probe to request Nexus cancellation',
          );
          await waitForCondition(async () => {
            const history = await cancelProbe.fetchHistory();
            return (history.events ?? []).some(
              ({ nexusOperationCancelRequestCompletedEventAttributes }) =>
                nexusOperationCancelRequestCompletedEventAttributes != null,
            );
          }, 'the Nexus handler cancellation request acknowledgement');
          assert.equal((await uploadHandle.describe()).status.name, 'RUNNING');

          await waitFor(
            cancelProbe.signal(MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_FINISH_SIGNAL),
            'the cancellation probe finish signal',
          );
          assert.deepEqual(await waitFor(cancelProbe.result(), 'cancellation probe completion'), {
            cancelled: true,
          });
          cancelProbeFinished = true;
        } finally {
          if (!cancelProbeFinished) {
            await waitFor(
              cancelProbe.signal(MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_CANCEL_SIGNAL),
              'cancellation probe cleanup cancel signal',
              3_000,
            ).catch(() => undefined);
            await waitFor(
              cancelProbe.signal(MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_FINISH_SIGNAL),
              'cancellation probe cleanup finish signal',
              3_000,
            ).catch(() => undefined);
            await waitFor(cancelProbe.result(), 'cancellation probe cleanup', 3_000).catch(
              () => undefined,
            );
          }
        }
        assert.equal((await uploadHandle.describe()).status.name, 'RUNNING');

        const joinerArgs = Array.from({ length: 2 }, () => ({
          ...withoutPostId(args),
          requestId: randomUUID(),
        }));
        const joinerHandles = await Promise.all(
          joinerArgs.map((postArgs) => startPostRequest(environment, KOSMO_TASK_QUEUE, postArgs)),
        );
        const handles = [creatorHandle, ...joinerHandles];
        await Promise.all(handles.map((handle) => waitForScheduledNexusOperations(handle, 1)));
        assert.deepEqual(
          await Promise.all(handles.map((handle) => waitForStartedNexusOperations(handle, 1))),
          [1, 1, 1],
        );

        for (const handle of handles.slice(0, 2)) {
          const cancelled = await handle.executeUpdate<PostRequestState, []>(
            POST_REQUEST_CANCEL_UPDATE,
            { args: [] },
          );
          assert.equal(cancelled.status, PostRequestStatus.CANCELLED);
        }
        const cancelledResults = await Promise.all(
          handles
            .slice(0, 2)
            .map((handle, index) =>
              waitFor(handle.result(), `cancelled Post Request ${index + 1}`, 3_000),
            ),
        );
        assert.ok(cancelledResults.every(({ status }) => status === PostRequestStatus.CANCELLED));
        assert.equal((await uploadHandle.describe()).status.name, 'RUNNING');
        assert.deepEqual(postCreateIds, []);

        releasePublish.resolve();
        const [uploadResult, published] = await Promise.all([
          waitFor(uploadHandle.result(), 'independent Media Upload result'),
          waitFor(handles[2]!.result(), 'remaining Post Request publication'),
        ]);
        assert.equal(uploadResult.id, `u_${mediaId}`);
        assert.equal(published.status, PostRequestStatus.PUBLISHED);
        assert.deepEqual(postCreateIds, [published.result?.postId]);
        assert.equal(prepareCalls, 1);
        assert.equal(finalizeCalls, 1);
        assert.equal(mediaRows.get(mediaId)?.state, MediaState.READY);
        assert.deepEqual(appliedNightshadeUploadIds, [`u_${mediaId}`]);
      } finally {
        releasePublish.resolve();
      }
    });
  },
);

test(
  'Post Request reuses READY Media without starting a Nexus operation',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const args = createPostRequest(true);
    const mediaId = args.input.media![0]!.mediaId;
    const mediaRows = new Map<string, PostRequestMediaRow>([
      [
        mediaId,
        {
          accountId: args.input.accountId,
          id: mediaId,
          source: MediaSource.LOCAL,
          state: MediaState.READY,
        },
      ],
    ]);
    mockPostRequestMediaDatabase(t, mediaRows);
    let prepareCalls = 0;
    const postCreateInputs: PostCreateActivityInput[] = [];
    const worker = await createWorker(environment, KOSMO_TASK_QUEUE, {
      ...postCreateEffectsActivities,
      createPostActivityV2: async (input) => {
        postCreateInputs.push(input);
        return committedPost(input);
      },
      getPostRequestMediaStateActivity,
      prepareMediaUploadActivity: async () => {
        prepareCalls += 1;
        assert.fail('READY Media must skip upload preparation');
      },
    });

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, KOSMO_TASK_QUEUE, args);
      const result = await waitFor(handle.result(), 'READY Media Post Request result');
      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.deepEqual(await waitForScheduledNexusOperations(handle, 0), []);
      assert.equal(prepareCalls, 0);
      assert.equal(postCreateInputs.length, 1);
    });
  },
);

test(
  'Post Request recovers when Media becomes READY after the initial read and Nexus upload fails',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());
    await environment.createNexusEndpoint(
      `${environment.namespace}-media-upload`,
      KOSMO_TASK_QUEUE,
    );

    const args = createPostRequest(true);
    let mediaStateReads = 0;
    let prepareCalls = 0;
    let finalizeCalls = 0;
    const postCreateInputs: PostCreateActivityInput[] = [];
    const worker = await createWorker(
      environment,
      KOSMO_TASK_QUEUE,
      {
        ...postCreateEffectsActivities,
        createPostActivityV2: async (input) => {
          postCreateInputs.push(input);
          return committedPost(input);
        },
        finalizeMediaUploadActivity: async () => {
          finalizeCalls += 1;
          assert.fail('The failed retry must not finalize already READY Media');
        },
        getPostRequestMediaStateActivity: async ({ mediaIds }) => {
          mediaStateReads += 1;
          return { readyMediaIds: mediaStateReads === 1 ? [] : mediaIds };
        },
        prepareMediaUploadActivity: async () => {
          prepareCalls += 1;
          throw ApplicationFailure.nonRetryable('Upload is already complete', 'MediaAlreadyReady');
        },
      },
      { nexusServices: [mediaUploadServiceHandler] },
    );

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, KOSMO_TASK_QUEUE, args);
      const result = await waitFor(handle.result(), 'READY-race Post Request result');
      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.equal(mediaStateReads, 2);
      assert.equal(prepareCalls, 1);
      assert.equal(finalizeCalls, 0);
      assert.equal(postCreateInputs.length, 1);
      assert.equal((await waitForScheduledNexusOperations(handle, 1)).length, 1);
    });
  },
);

test(
  'Post Request fails every joiner when the shared Nexus Media Upload fails without READY proof',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    const releasePublish = Promise.withResolvers<void>();
    const remoteWorkers: RunningTestWorker[] = [];
    const resourceCleanups: Array<() => Promise<void>> = [];
    registerTestCleanup(
      t,
      environment,
      [() => releasePublish.resolve()],
      remoteWorkers,
      resourceCleanups,
    );

    const args = createPostRequest(true);
    const mediaId = args.input.media![0]!.mediaId;
    const mediaRows = new Map<string, PostRequestMediaRow>([
      [
        mediaId,
        {
          accountId: args.input.accountId,
          id: mediaId,
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
        },
      ],
    ]);
    mockPostRequestMediaDatabase(t, mediaRows);

    const publishStarted = Promise.withResolvers<void>();
    const appliedNightshadeUploadIds: string[] = [];
    const remoteTaskQueue = await createMediaUploadNexusEndpoints(
      environment,
      t.signal,
      resourceCleanups,
    );
    remoteWorkers.push(
      await createMediaUploadTestNexusWorker(
        environment,
        remoteTaskQueue,
        appliedNightshadeUploadIds,
        {
          beforePublish: async () => {
            publishStarted.resolve();
            await releasePublish.promise;
          },
          shouldFail: true,
        },
      ),
    );
    let prepareCalls = 0;
    let finalizeCalls = 0;
    const postCreateInputs: PostCreateActivityInput[] = [];
    const worker = await createWorker(
      environment,
      KOSMO_TASK_QUEUE,
      {
        ...postCreateEffectsActivities,
        ...createMockMediaUploadActivities(
          mediaRows,
          () => {
            prepareCalls += 1;
          },
          () => {
            finalizeCalls += 1;
          },
        ),
        createPostActivityV2: async (input) => {
          postCreateInputs.push(input);
          return committedPost(input);
        },
        getPostRequestMediaStateActivity,
      },
      { nexusServices: [mediaUploadServiceHandler] },
    );

    await worker.runUntil(async () => {
      const uploadInput = {
        accountId: args.input.accountId,
        applyNightshade: true,
        mediaId,
      };
      const uploadHandle = await environment.client.workflow.start(mediaUploadWorkflow.workflow, {
        args: [uploadInput],
        taskQueue: KOSMO_TASK_QUEUE,
        workflowId: mediaUploadWorkflow.workflowIdFromArgs(uploadInput),
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });

      try {
        await waitFor(publishStarted.promise, 'the remote Media publish gate');
        const joinerArgs = { ...withoutPostId(args), requestId: randomUUID() };
        const handles = await Promise.all(
          [args, joinerArgs].map((postArgs) =>
            startPostRequest(environment, KOSMO_TASK_QUEUE, postArgs),
          ),
        );
        await Promise.all(handles.map((handle) => waitForScheduledNexusOperations(handle, 1)));
        assert.deepEqual(
          await Promise.all(handles.map((handle) => waitForStartedNexusOperations(handle, 1))),
          [1, 1],
        );
        assert.equal((await uploadHandle.describe()).status.name, 'RUNNING');
        assert.equal(prepareCalls, 1);
        assert.equal(mediaRows.get(mediaId)?.state, MediaState.UPLOADING);

        releasePublish.resolve();
        const uploadFailure = waitFor(
          uploadHandle.result(),
          'failed shared Media Upload result',
        ).then(
          () => assert.fail('The shared Media Upload is expected to fail'),
          (error: unknown) => error,
        );
        const results = await Promise.all(
          handles.map((handle, index) =>
            waitFor(handle.result(), `failed Post Request ${index + 1}`),
          ),
        );
        const failure = await uploadFailure;
        assert.ok(failure instanceof Error);
        assert.ok(results.every(({ status }) => status === PostRequestStatus.FAILED));
        assert.ok(results.every(({ error }) => error?.code === 'INTERNAL_SERVER_ERROR'));
        assert.equal(postCreateInputs.length, 0);
        assert.equal(finalizeCalls, 0);
        assert.equal(mediaRows.get(mediaId)?.state, MediaState.UPLOADING);
        assert.deepEqual(appliedNightshadeUploadIds, [`u_${mediaId}`]);
      } finally {
        releasePublish.resolve();
      }
    });
  },
);

test(
  'Post Request preserves legacy snapshot processing flags and attachment order',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    const remoteWorkers: RunningTestWorker[] = [];
    const resourceCleanups: Array<() => Promise<void>> = [];
    registerTestCleanup(t, environment, [], remoteWorkers, resourceCleanups);

    const mediaIdA = randomUUID();
    const mediaIdB = randomUUID();
    const postId = randomUUID();
    const args: LegacyPostRequestWorkflowArgs = {
      input: {
        accountId: randomUUID(),
        bodyText: 'A local post',
        media: [
          { altText: 'B attachment', mediaId: mediaIdB },
          { altText: 'A attachment', mediaId: mediaIdA },
        ],
        origin: 'LOCAL',
        profileId: randomUUID(),
        visibility: PostVisibility.PUBLIC,
      },
      mediaProcessing: [
        { applyNightshade: true, mediaId: mediaIdA },
        { applyNightshade: false, mediaId: mediaIdB },
      ],
      postId,
      requestId: randomUUID(),
      submittedAt: '2026-10-29T00:00:00.000Z',
    };
    const argsWithIncidentalFlags = {
      ...args,
      input: {
        ...args.input,
        media: args.input.media?.map((media) => ({
          ...media,
          applyNightshade: media.mediaId === mediaIdB,
        })),
      },
    };
    const mediaRows = new Map<string, PostRequestMediaRow>(
      [mediaIdA, mediaIdB].map((id) => [
        id,
        {
          accountId: args.input.accountId,
          id,
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
        },
      ]),
    );
    mockPostRequestMediaDatabase(t, mediaRows);

    const appliedNightshadeUploadIds: string[] = [];
    const generatedUploadInputs: MediaUploadTestStartInput[] = [];
    const remoteTaskQueue = await createMediaUploadNexusEndpoints(
      environment,
      t.signal,
      resourceCleanups,
    );
    remoteWorkers.push(
      await createMediaUploadTestNexusWorker(
        environment,
        remoteTaskQueue,
        appliedNightshadeUploadIds,
        { onGenerateAltText: (input) => generatedUploadInputs.push(input) },
      ),
    );
    const preparedMedia: {
      readonly applyNightshade: boolean | undefined;
      readonly mediaId: string;
    }[] = [];
    const mediaStateChecks: string[][] = [];
    const postCreateInputs: PostCreateActivityInput[] = [];
    const worker = await createWorker(
      environment,
      KOSMO_TASK_QUEUE,
      {
        ...postCreateEffectsActivities,
        ...createMockMediaUploadActivities(mediaRows, ({ applyNightshade, mediaId }) => {
          preparedMedia.push({ applyNightshade, mediaId });
        }),
        createPostActivityV2: async (input) => {
          postCreateInputs.push(input);
          return committedPost(input);
        },
        getPostRequestMediaStateActivity: async (input) => {
          mediaStateChecks.push([...input.mediaIds]);
          return getPostRequestMediaStateActivity(input);
        },
      },
      { nexusServices: [mediaUploadServiceHandler] },
    );

    await worker.runUntil(async () => {
      const handle = await startLegacyPostRequest(
        environment,
        KOSMO_TASK_QUEUE,
        argsWithIncidentalFlags,
      );
      const result = await waitFor(handle.result(), 'legacy snapshot Post Request result');
      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.equal(result.result?.postId, postId);
      assert.deepEqual(result.snapshot.input.media, [
        { altText: 'B attachment', applyNightshade: false, mediaId: mediaIdB },
        { altText: 'A attachment', applyNightshade: true, mediaId: mediaIdA },
      ]);
      assert.deepEqual(mediaStateChecks, [[mediaIdA, mediaIdB]]);
      assert.deepEqual(
        preparedMedia.toSorted((left, right) => left.mediaId.localeCompare(right.mediaId)),
        [
          { applyNightshade: true, mediaId: mediaIdA },
          { applyNightshade: false, mediaId: mediaIdB },
        ].toSorted((left, right) => left.mediaId.localeCompare(right.mediaId)),
      );
      assert.deepEqual(appliedNightshadeUploadIds, [`u_${mediaIdA}`]);
      assert.deepEqual(generatedUploadInputs, []);
      assert.deepEqual(postCreateInputs, [
        {
          input: args.input,
          postId,
          revalidateAuthorization: true,
        },
      ]);
      assert.equal((await waitForScheduledNexusOperations(handle, 2)).length, 2);
    });
  },
);

test(
  'Post Request resumes its saved snapshot and V2 child after the Worker restarts',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `post-request-restart-${process.pid}-${randomUUID()}`;
    const args = createPostRequest(false, 'a'.repeat(64));
    const firstAttemptStarted = Promise.withResolvers<void>();
    const releaseFirstAttempt = Promise.withResolvers<void>();
    const firstWorker = await createWorker(environment, taskQueue, {
      ...postCreateEffectsActivities,
      createPostActivityV2: async () => {
        firstAttemptStarted.resolve();
        await releaseFirstAttempt.promise;
        throw ApplicationFailure.retryable(
          'Database commit reply timed out',
          'POST_CREATE_TIMEOUT',
        );
      },
    });
    const firstWorkerRun = firstWorker.run();
    void firstWorkerRun.catch(() => undefined);

    const handle = await startPostRequest(environment, taskQueue, args);
    await firstAttemptStarted.promise;
    assert.equal(
      (await handle.query<PostRequestState>(POST_REQUEST_STATE_QUERY)).status,
      'PUBLISHING',
    );

    const shutdown = firstWorker.shutdown();
    releaseFirstAttempt.resolve();
    await shutdown;
    await firstWorkerRun;

    const resumedPostInputs: PostCreateActivityInput[] = [];
    const resumedWorker = await createWorker(environment, taskQueue, {
      ...postCreateEffectsActivities,
      createPostActivityV2: async (input) => {
        resumedPostInputs.push(input);
        return committedPost(input);
      },
    });
    await resumedWorker.runUntil(async () => {
      const result = await handle.result();
      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.equal(result.result?.postId, args.postId);
      assert.equal(result.snapshot.submissionFingerprint, args.submissionFingerprint);
      assert.deepEqual(resumedPostInputs, [
        {
          input: args.input,
          postId: args.postId,
          revalidateAuthorization: true,
        },
      ]);

      const history = await handle.fetchHistory();
      const postCreateChild = (history.events ?? []).find(
        (event) =>
          event.childWorkflowExecutionStartedEventAttributes?.workflowType?.name ===
          POST_CREATE_WORKFLOW_V2_TYPE,
      );
      assert.ok(postCreateChild);
      assert.equal(
        postCreateChild.childWorkflowExecutionStartedEventAttributes?.workflowExecution?.workflowId,
        `post-create:${handle.firstExecutionRunId}`,
      );
    });
  },
);

test(
  'Post Request returns a closed FAILED result and rejects a second execution for that request ID',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `post-request-failed-${process.pid}-${randomUUID()}`;
    const args = createPostRequest();
    let createAttempts = 0;
    let postIdGenerationCalls = 0;
    const worker = await createWorker(environment, taskQueue, {
      createPostActivityV2: async () => {
        createAttempts += 1;
        throw ApplicationFailure.nonRetryable(
          'Reply Parent must have content',
          'VALIDATION',
          'replyParentId',
        );
      },
      generatePostIdActivity: async () => {
        postIdGenerationCalls += 1;
        return randomUUID();
      },
    });

    await worker.runUntil(async () => {
      const failedHandle = await startPostRequest(environment, taskQueue, args);
      const failed = await failedHandle.result();
      assert.equal(failed.status, PostRequestStatus.FAILED);
      assert.equal(failed.error?.code, 'VALIDATION');
      assert.equal(failed.error?.field, 'replyParentId');
      assert.equal(failed.error?.message, 'Reply Parent must have content');
      assert.deepEqual(
        await failedHandle.query<PostRequestState>(POST_REQUEST_STATE_QUERY),
        failed,
      );

      await assert.rejects(
        environment.client.workflow.start(POST_REQUEST_WORKFLOW_TYPE, {
          args: [args],
          taskQueue,
          workflowId: failedHandle.workflowId,
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
          workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        }),
        (error: unknown) =>
          error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError',
      );
      assert.equal((await failedHandle.describe()).status.name, 'COMPLETED');
      assert.equal(createAttempts, 1);
      assert.equal(postIdGenerationCalls, 0);
    });
  },
);

test(
  'Post Request closes FAILED with a sanitized result if Post ID generation fails before publication',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `post-request-id-failed-${process.pid}-${randomUUID()}`;
    const args = withoutPostId(createPostRequest());
    let postCreateCalls = 0;
    const worker = await createWorker(environment, taskQueue, {
      createPostActivityV2: async () => {
        postCreateCalls += 1;
        return committedPost({
          input: args.input,
          postId: randomUUID(),
        });
      },
      generatePostIdActivity: async () => {
        throw ApplicationFailure.nonRetryable(
          'database rejected UUID allocation with private details',
          'POST_ID_GENERATION_FAILED',
          'private.databaseField',
        );
      },
    });

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, taskQueue, args);
      const result = await handle.result();
      assert.equal(result.status, PostRequestStatus.FAILED);
      assert.equal(result.error?.code, 'INTERNAL_SERVER_ERROR');
      assert.equal(result.error?.message, 'The post request could not be completed');
      assert.equal(result.error?.field, undefined);
      assert.equal(result.snapshot.postId, undefined);
      assert.equal(postCreateCalls, 0);
    });
  },
);

test(
  'Post Request returns after the V2 Post commit while post-create effects continue',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `post-request-effects-${process.pid}-${randomUUID()}`;
    const args = { ...createPostRequest(), analyticsPlatform: 'native' as const };
    const postCreateInputs: PostCreateActivityInput[] = [];
    const effectsStarted = Promise.withResolvers<void>();
    const releaseEffects = Promise.withResolvers<void>();
    const captureStarted = Promise.withResolvers<void>();
    const releaseCapture = Promise.withResolvers<void>();
    const analyticsCalls: CapturePostCreatedInput[] = [];
    let effectsCompleted = false;
    let captureCompleted = false;
    const worker = await createWorker(environment, taskQueue, {
      createPostActivityV2: async (input) => {
        postCreateInputs.push(input);
        return committedPost(input);
      },
      createNotificationActivity: async () => {},
      createReplyNotificationActivity: async () => [],
      fanoutHomeTimelinePostActivity: async () => {},
      loadHomeTimelineRecipientPageActivity: async () => ({ profileIds: [], nextCursor: null }),
      insertHomeTimelinePostActivity: async () => undefined,
      sendLocalPostCreateActivity: async () => {
        effectsStarted.resolve();
        await releaseEffects.promise;
        effectsCompleted = true;
      },
      capturePostCreatedActivity: async (input: CapturePostCreatedInput) => {
        analyticsCalls.push(input);
        captureStarted.resolve();
        await releaseCapture.promise;
        captureCompleted = true;
      },
    });

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, taskQueue, args);
      const resultPromise = handle.result();
      await Promise.all([effectsStarted.promise, captureStarted.promise]);
      const result = await resultPromise;

      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.equal(result.result?.postId, args.postId);
      assert.equal(effectsCompleted, false);
      assert.equal(captureCompleted, false);
      assert.deepEqual(analyticsCalls, [{ analyticsPlatform: 'native', postId: args.postId! }]);
      assert.deepEqual(postCreateInputs, [
        {
          input: args.input,
          postId: args.postId,
          revalidateAuthorization: true,
        },
      ]);

      const history = await handle.fetchHistory();
      const postCreateChild = (history.events ?? []).find(
        (event) =>
          event.childWorkflowExecutionStartedEventAttributes?.workflowType?.name ===
          POST_CREATE_WORKFLOW_V2_TYPE,
      );
      assert.ok(postCreateChild);
      assert.equal(
        postCreateChild.childWorkflowExecutionStartedEventAttributes?.workflowExecution?.workflowId,
        `post-create:${handle.firstExecutionRunId}`,
      );

      releaseEffects.resolve();
      releaseCapture.resolve();
      const effectHandle = environment.client.workflow.getHandle(
        `post-create-effects:${args.postId}`,
      );
      await effectHandle.result();
      assert.equal(effectsCompleted, true);
      assert.equal(captureCompleted, true);
    });
  },
);

test(
  'Post Request does not treat a nonbusiness TypeNotFound and later domain rejection as terminal before reconciliation',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `post-request-reconcile-${process.pid}-${randomUUID()}`;
    const args = { ...withoutPostId(createPostRequest()), analyticsPlatform: 'web' as const };
    const generatedPostId = randomUUID();
    const lateReconciliationStarted = Promise.withResolvers<void>();
    const releaseLateReconciliation = Promise.withResolvers<void>();
    const effectsStarted = Promise.withResolvers<void>();
    const releaseEffects = Promise.withResolvers<void>();
    const captureStarted = Promise.withResolvers<void>();
    let createAttempts = 0;
    let reconciliationAttempts = 0;
    let postIdGenerationCalls = 0;
    let effectsCompleted = false;
    const analyticsCalls: CapturePostCreatedInput[] = [];
    const postCreateInputs: PostCreateActivityInput[] = [];
    const worker = await createWorker(environment, taskQueue, {
      ...postCreateEffectsActivities,
      createPostActivityV2: async (input) => {
        createAttempts += 1;
        postCreateInputs.push(input);
        if (createAttempts === 1) {
          throw ApplicationFailure.nonRetryable(
            'The Post Create V2 workflow type is unavailable',
            'TypeNotFound',
          );
        }
        throw ApplicationFailure.nonRetryable(
          'The account no longer permits this Post',
          'PERMISSION_DENIED',
        );
      },
      generatePostIdActivity: async () => {
        postIdGenerationCalls += 1;
        return generatedPostId;
      },
      reconcilePostRequestActivity: async ({ postId }) => {
        assert.equal(postId, generatedPostId);
        reconciliationAttempts += 1;
        if (reconciliationAttempts === 1) {
          return { status: 'ABSENT' as const };
        }
        lateReconciliationStarted.resolve();
        await releaseLateReconciliation.promise;
        return { postId, status: 'PUBLISHED' as const };
      },
      sendLocalPostCreateActivity: async () => {
        effectsStarted.resolve();
        await releaseEffects.promise;
        effectsCompleted = true;
      },
      capturePostCreatedActivity: async (input: CapturePostCreatedInput) => {
        analyticsCalls.push(input);
        captureStarted.resolve();
      },
    });

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, taskQueue, args);
      assert.equal(args.postId, undefined);
      await lateReconciliationStarted.promise;

      assert.equal(
        (await handle.query<PostRequestState>(POST_REQUEST_STATE_QUERY)).status,
        PostRequestStatus.CONFIRMING,
      );
      const cancelResult = await handle.executeUpdate<PostRequestState, []>(
        POST_REQUEST_CANCEL_UPDATE,
        {
          args: [],
        },
      );
      assert.equal(cancelResult.status, PostRequestStatus.CONFIRMING);

      releaseLateReconciliation.resolve();
      const resultPromise = handle.result();
      await Promise.all([effectsStarted.promise, captureStarted.promise]);
      const result = await resultPromise;
      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.equal(result.result?.postId, generatedPostId);
      assert.equal(effectsCompleted, false);
      assert.deepEqual(analyticsCalls, [{ analyticsPlatform: 'web', postId: generatedPostId }]);
      assert.equal(createAttempts, 2);
      assert.equal(reconciliationAttempts, 2);
      assert.equal(postIdGenerationCalls, 1);
      assert.deepEqual(
        postCreateInputs.map(({ postId }) => postId),
        [generatedPostId, generatedPostId],
      );

      const history = await handle.fetchHistory();
      const effectsChild = (history.events ?? []).find(
        (event) =>
          event.childWorkflowExecutionStartedEventAttributes?.workflowType?.name ===
          'postCreateEffectsWorkflow',
      );
      assert.ok(effectsChild);
      assert.equal(
        effectsChild.childWorkflowExecutionStartedEventAttributes?.workflowExecution?.workflowId,
        `post-create-effects:${generatedPostId}`,
      );

      releaseEffects.resolve();
      const effectsHandle = environment.client.workflow.getHandle(
        `post-create-effects:${generatedPostId}`,
      );
      await effectsHandle.result();
      assert.equal(effectsCompleted, true);
    });
  },
);

test(
  'Post Request reconciliation tolerates an already-running effects child',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `post-request-reconcile-effects-existing-${process.pid}-${randomUUID()}`;
    const postId = randomUUID();
    const args = { ...createPostRequest(), analyticsPlatform: 'native' as const, postId };
    const effectsStarted = Promise.withResolvers<void>();
    const releaseEffects = Promise.withResolvers<void>();
    let effectCalls = 0;
    let effectsCompleted = false;
    const analyticsCalls: CapturePostCreatedInput[] = [];
    const worker = await createWorker(environment, taskQueue, {
      ...postCreateEffectsActivities,
      createPostActivityV2: async () => {
        throw ApplicationFailure.nonRetryable(
          'The Post Create V2 workflow type is unavailable',
          'TypeNotFound',
        );
      },
      reconcilePostRequestActivity: async ({ postId: reconciledPostId }) => ({
        postId: reconciledPostId,
        status: 'PUBLISHED' as const,
      }),
      sendLocalPostCreateActivity: async () => {
        effectCalls += 1;
        effectsStarted.resolve();
        await releaseEffects.promise;
        effectsCompleted = true;
      },
      capturePostCreatedActivity: async (input: CapturePostCreatedInput) => {
        analyticsCalls.push(input);
      },
    });

    await worker.runUntil(async () => {
      const effectsWorkflowId = `post-create-effects:${postId}`;
      const effectsHandle = await environment.client.workflow.start('postCreateEffectsWorkflow', {
        args: [{ analyticsPlatform: 'native', origin: 'LOCAL', postId }],
        taskQueue,
        workflowId: effectsWorkflowId,
      });
      await effectsStarted.promise;

      const requestHandle = await startPostRequest(environment, taskQueue, args);
      const result = await requestHandle.result();
      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.equal(result.result?.postId, postId);
      assert.equal(effectCalls, 1);
      assert.equal(effectsCompleted, false);

      releaseEffects.resolve();
      await effectsHandle.result();
      assert.equal(effectCalls, 1);
      assert.equal(effectsCompleted, true);
      assert.deepEqual(analyticsCalls, [{ analyticsPlatform: 'native', postId }]);
    });
  },
);
