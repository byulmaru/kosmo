import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PostVisibility } from '@kosmo/core/enums';
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
import {
  ApplicationFailure,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { getClient, startWorkflow, WorkflowRunOperationHandler } from '@temporalio/nexus';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { operation, service, serviceHandler } from 'nexus-rpc';
import { temporalTestExecutable } from './temporal-test-executable.js';
import { POST_REQUEST_TEST_SEARCH_ATTRIBUTES } from './temporal-test-search-attributes.js';
import {
  MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL,
  MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL,
  mockMediaUploadNexusOperationWorkflow,
} from './test-fixtures/media-upload-nexus-operation';
import type { NexusMediaUploadContentType } from '@kosmo/core/media-upload';
import type { MediaUploadWorkflowResult } from '@kosmo/core/temporal/media-upload';
import type {
  PostCreateActivityInput,
  PostCreateActivityResult,
} from '@kosmo/core/temporal/post-create';
import type { PostRequestState, PostRequestWorkflowArgs } from '@kosmo/core/temporal/post-request';
import type * as activities from './activities';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
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
) =>
  Worker.create({
    activities: workerActivities,
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    taskQueue,
    workflowsPath,
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
) => {
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    nexusServices: [
      serviceHandler(mediaUploadTestService, {
        startUpload: new WorkflowRunOperationHandler<
          MediaUploadTestStartInput,
          MediaUploadWorkflowResult
        >(async (context, input) =>
          startWorkflow(context, mockMediaUploadNexusOperationWorkflow, {
            args: [
              {
                result: {
                  id: input.id,
                  mediaType: 'image/jpeg',
                  url: 'https://media.example/' + input.id + '.jpg',
                },
                shouldFail: false,
              },
            ],
            workflowExecutionTimeout: '25 hours',
            workflowId: 'mock-media-upload:' + input.id,
          }),
        ),
        applyHope: async (_context, { id }) => {
          appliedNightshadeUploadIds.push(id);
          return { id };
        },
        publishUpload: async (_context, { id }) => {
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
  sendLocalPostCreateActivity: async () => {},
};

const createPostRequestTestEnvironment = () =>
  TestWorkflowEnvironment.createLocal({
    server: {
      executable: temporalTestExecutable,
      searchAttributes: [...POST_REQUEST_TEST_SEARCH_ATTRIBUTES],
    },
  });

test(
  'Post Request cancel closes during media upload and does not start another upload or Post creation',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `post-request-cancel-${process.pid}-${randomUUID()}`;
    const initialArgs = createPostRequest(true);
    const initialMedia = initialArgs.input.media ?? [];
    const mediaId = initialMedia[0]!.mediaId;
    const secondMediaId = randomUUID();
    const args: LegacyPostRequestWorkflowArgs = {
      ...initialArgs,
      input: {
        ...initialArgs.input,
        media: [
          { altText: null, mediaId: secondMediaId },
          ...initialMedia.map(({ altText, mediaId }) => ({ altText, mediaId })),
        ],
      },
      mediaProcessing: [
        ...initialMedia.map(({ applyNightshade, mediaId }) => ({ applyNightshade, mediaId })),
        { applyNightshade: true, mediaId: secondMediaId },
      ],
    };
    const prepareStarted = Promise.withResolvers<void>();
    const releasePrepare = Promise.withResolvers<void>();
    const postCreateCalls: PostCreateActivityInput[] = [];
    const checkedMediaIds: string[][] = [];
    const preparedMedia: {
      readonly applyNightshade: boolean | undefined;
      readonly mediaId: string;
    }[] = [];
    let prepareCalls = 0;
    const worker = await createWorker(environment, taskQueue, {
      ...postCreateEffectsActivities,
      createPostActivityV2: async (input) => {
        postCreateCalls.push(input);
        return committedPost(input);
      },
      getPostRequestMediaStateActivity: async ({ mediaIds }) => {
        checkedMediaIds.push([...mediaIds]);
        return { readyMediaIds: [] };
      },
      prepareMediaUploadActivity: async ({ applyNightshade, mediaId: preparedMediaId }) => {
        preparedMedia.push({ applyNightshade, mediaId: preparedMediaId });
        assert.equal(preparedMediaId, mediaId);
        prepareCalls += 1;
        prepareStarted.resolve();
        await releasePrepare.promise;
        throw ApplicationFailure.nonRetryable('Blocked media test upload', 'TEST_MEDIA_FAILURE');
      },
    });

    await worker.runUntil(async () => {
      const handle = await startLegacyPostRequest(environment, taskQueue, args);
      await prepareStarted.promise;
      const processing = await handle.query<PostRequestState>(POST_REQUEST_STATE_QUERY);
      assert.equal(processing.status, 'PROCESSING');
      assert.deepEqual(processing.snapshot.input.media, [
        { altText: null, applyNightshade: true, mediaId: secondMediaId },
        { altText: null, applyNightshade: true, mediaId },
      ]);
      assert.deepEqual(checkedMediaIds, [[mediaId, secondMediaId]]);

      const cancelled = await handle.executeUpdate<PostRequestState, []>(
        POST_REQUEST_CANCEL_UPDATE,
        {
          args: [],
        },
      );
      assert.equal(cancelled.status, PostRequestStatus.CANCELLED);
      const result = await handle.result();
      assert.equal(result.status, PostRequestStatus.CANCELLED);
      assert.deepEqual(postCreateCalls, []);
      assert.deepEqual(preparedMedia, [{ applyNightshade: true, mediaId }]);
      assert.equal(prepareCalls, 1);

      const mediaUploadHandle = environment.client.workflow.getHandle(
        mediaUploadWorkflow.workflowIdFromArgs({
          accountId: args.input.accountId,
          applyNightshade: true,
          mediaId,
        }),
      );
      assert.equal((await mediaUploadHandle.describe()).status.name, 'RUNNING');
      releasePrepare.resolve();
      await assert.rejects(mediaUploadHandle.result());
    });
  },
);

test(
  'Post Request joins an existing Media Upload Workflow before publishing',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `post-request-media-join-${process.pid}-${randomUUID()}`;
    const nexusTaskQueue = `${taskQueue}-nexus`;
    await environment.createNexusEndpoint('media-upload', nexusTaskQueue);

    const appliedNightshadeUploadIds: string[] = [];
    const { worker: nexusWorker, workerRun: nexusWorkerRun } =
      await createMediaUploadTestNexusWorker(
        environment,
        nexusTaskQueue,
        appliedNightshadeUploadIds,
      );

    const args = createPostRequest(true);
    const mediaId = args.input.media![0]!.mediaId;
    const secondArgs: PostRequestWorkflowArgs = {
      ...withoutPostId(args),
      requestId: randomUUID(),
    };
    const generatedPostId = randomUUID();
    const prepareStarted = Promise.withResolvers<void>();
    const releasePrepare = Promise.withResolvers<void>();
    const joinedExistingUpload = Promise.withResolvers<void>();
    const mediaReady = Promise.withResolvers<void>();
    const postIdGenerationStarted = Promise.withResolvers<void>();
    const releasePostIdGeneration = Promise.withResolvers<void>();
    let isMediaReady = false;
    let prepareCalls = 0;
    let joinCalls = 0;
    let postIdGenerationCalls = 0;
    const postCreateInputs: PostCreateActivityInput[] = [];
    const preparedMedia: {
      readonly applyNightshade: boolean | undefined;
      readonly mediaId: string;
    }[] = [];
    const worker = await createWorker(environment, taskQueue, {
      ...postCreateEffectsActivities,
      createPostActivityV2: async (input) => {
        assert.equal(isMediaReady, true);
        postCreateInputs.push(input);
        return committedPost(input);
      },
      generatePostIdActivity: async () => {
        assert.equal(isMediaReady, true);
        postIdGenerationCalls += 1;
        postIdGenerationStarted.resolve();
        await releasePostIdGeneration.promise;
        return generatedPostId;
      },
      finalizeMediaUploadActivity: async ({ result }) => {
        isMediaReady = true;
        mediaReady.resolve();
        return result;
      },
      getPostRequestMediaStateActivity: async ({ mediaIds }) => ({
        readyMediaIds: isMediaReady ? mediaIds : [],
      }),
      prepareMediaUploadActivity: async ({ applyNightshade, mediaId: preparedMediaId }) => {
        preparedMedia.push({ applyNightshade, mediaId: preparedMediaId });
        assert.equal(preparedMediaId, mediaId);
        prepareCalls += 1;
        prepareStarted.resolve();
        await releasePrepare.promise;
        return {
          contentType: 'image/jpeg',
          id: `u_${mediaId}`,
          sourceKey: `uploads/${mediaId}`,
        };
      },
      waitForPostRequestMediaUploadActivity: async ({ mediaId: joinedMediaId }) => {
        assert.equal(joinedMediaId, mediaId);
        joinCalls += 1;
        joinedExistingUpload.resolve();
        await mediaReady.promise;
      },
    });

    try {
      await worker.runUntil(async () => {
        const firstHandle = await startPostRequest(environment, taskQueue, args);
        await prepareStarted.promise;
        const secondHandle = await startPostRequest(environment, taskQueue, secondArgs);
        await joinedExistingUpload.promise;

        assert.equal(joinCalls, 1);
        assert.equal(prepareCalls, 1);
        assert.equal(postIdGenerationCalls, 0);
        assert.deepEqual(postCreateInputs, []);
        const secondState = await secondHandle.query<PostRequestState>(POST_REQUEST_STATE_QUERY);
        assert.equal(secondState.status, PostRequestStatus.PROCESSING);
        assert.deepEqual(secondState.snapshot.input.media, args.input.media);

        releasePrepare.resolve();
        await postIdGenerationStarted.promise;
        assert.equal(
          (await secondHandle.query<PostRequestState>(POST_REQUEST_STATE_QUERY)).status,
          PostRequestStatus.PUBLISHING,
        );
        const cancelWhileGenerating = await secondHandle.executeUpdate<PostRequestState, []>(
          POST_REQUEST_CANCEL_UPDATE,
          { args: [] },
        );
        assert.equal(cancelWhileGenerating.status, PostRequestStatus.PUBLISHING);
        releasePostIdGeneration.resolve();
        const [firstResult, secondResult] = await Promise.all([
          firstHandle.result(),
          secondHandle.result(),
        ]);
        assert.equal(firstResult.status, PostRequestStatus.PUBLISHED);
        assert.equal(secondResult.status, PostRequestStatus.PUBLISHED);
        assert.deepEqual(
          new Set(postCreateInputs.map(({ postId }) => postId)),
          new Set([args.postId, generatedPostId]),
        );
        assert.equal(postIdGenerationCalls, 1);
        assert.equal(isMediaReady, true);
        assert.deepEqual(preparedMedia, [{ applyNightshade: true, mediaId }]);
        assert.deepEqual(appliedNightshadeUploadIds, ['u_' + mediaId]);
        assert.equal(prepareCalls, 1);
        assert.ok(args.input.media);
        const childMedia = args.input.media.map(({ altText, mediaId }) => ({ altText, mediaId }));
        assert.deepEqual(
          postCreateInputs.map(({ input }) => input.media),
          [childMedia, childMedia],
        );
      });
    } finally {
      await nexusWorker.shutdown();
      await nexusWorkerRun;
    }
  },
);

test(
  'Post Request resumes a legacy snapshot in upload order and preserves attachment order',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createPostRequestTestEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = 'post-request-legacy-restart-' + process.pid + '-' + randomUUID();
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
    const nexusTaskQueue = taskQueue + '-nexus';
    await environment.createNexusEndpoint('media-upload', nexusTaskQueue);
    const appliedNightshadeUploadIds: string[] = [];
    const { worker: nexusWorker, workerRun: nexusWorkerRun } =
      await createMediaUploadTestNexusWorker(
        environment,
        nexusTaskQueue,
        appliedNightshadeUploadIds,
      );
    const mediaStateChecks: string[][] = [];
    const preparedMedia: {
      readonly applyNightshade: boolean | undefined;
      readonly mediaId: string;
    }[] = [];
    const firstAttemptStarted = Promise.withResolvers<void>();
    const releaseFirstAttempt = Promise.withResolvers<void>();
    const firstPostCreateInputs: PostCreateActivityInput[] = [];
    let postIdGenerationCalls = 0;

    try {
      const firstWorker = await createWorker(environment, taskQueue, {
        ...postCreateEffectsActivities,
        createPostActivityV2: async (input) => {
          firstPostCreateInputs.push(input);
          firstAttemptStarted.resolve();
          await releaseFirstAttempt.promise;
          throw ApplicationFailure.retryable(
            'Database commit reply timed out',
            'POST_CREATE_TIMEOUT',
          );
        },
        generatePostIdActivity: async () => {
          postIdGenerationCalls += 1;
          return randomUUID();
        },
        getPostRequestMediaStateActivity: async ({ mediaIds }) => {
          mediaStateChecks.push([...mediaIds]);
          return { readyMediaIds: [] };
        },
        finalizeMediaUploadActivity: async ({ result }) => result,
        prepareMediaUploadActivity: async ({ applyNightshade, mediaId }) => {
          preparedMedia.push({ applyNightshade, mediaId });
          return {
            contentType: 'image/jpeg',
            id: 'u_' + mediaId,
            sourceKey: 'uploads/' + mediaId,
          };
        },
      });
      const firstWorkerRun = firstWorker.run();
      void firstWorkerRun.catch(() => undefined);

      const handle = await startLegacyPostRequest(environment, taskQueue, argsWithIncidentalFlags);
      await firstAttemptStarted.promise;

      const publishing = await handle.query<PostRequestState>(POST_REQUEST_STATE_QUERY);
      assert.equal(publishing.status, PostRequestStatus.PUBLISHING);
      assert.deepEqual(publishing.snapshot.input.media, [
        { altText: 'B attachment', applyNightshade: false, mediaId: mediaIdB },
        { altText: 'A attachment', applyNightshade: true, mediaId: mediaIdA },
      ]);
      assert.deepEqual(mediaStateChecks, [[mediaIdA, mediaIdB]]);
      assert.deepEqual(preparedMedia, [
        { applyNightshade: true, mediaId: mediaIdA },
        { applyNightshade: false, mediaId: mediaIdB },
      ]);
      assert.deepEqual(appliedNightshadeUploadIds, ['u_' + mediaIdA]);
      assert.deepEqual(firstPostCreateInputs, [
        {
          input: args.input,
          postId,
          revalidateAuthorization: true,
        },
      ]);
      assert.equal(postIdGenerationCalls, 0);

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
        assert.equal(result.result?.postId, postId);
        assert.deepEqual(result.snapshot.input.media, [
          { altText: 'B attachment', applyNightshade: false, mediaId: mediaIdB },
          { altText: 'A attachment', applyNightshade: true, mediaId: mediaIdA },
        ]);
        assert.deepEqual(resumedPostInputs, [
          {
            input: args.input,
            postId,
            revalidateAuthorization: true,
          },
        ]);

        const history = await handle.fetchHistory();
        const uploadChildWorkflowIds = (history.events ?? []).flatMap((event) => {
          const attributes = event.childWorkflowExecutionStartedEventAttributes;
          return attributes?.workflowType?.name === mediaUploadWorkflow.workflow
            ? [attributes.workflowExecution?.workflowId]
            : [];
        });
        assert.deepEqual(uploadChildWorkflowIds, [
          'media-upload:' + mediaIdA,
          'media-upload:' + mediaIdB,
        ]);
      });
    } finally {
      await nexusWorker.shutdown();
      await nexusWorkerRun;
    }
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
          'The account no longer permits this Post',
          'PERMISSION_DENIED',
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
      assert.equal(failed.error?.code, 'PERMISSION_DENIED');
      assert.equal(failed.error?.message, 'The account no longer permits this Post');
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
        );
      },
    });

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, taskQueue, args);
      const result = await handle.result();
      assert.equal(result.status, PostRequestStatus.FAILED);
      assert.equal(result.error?.code, 'INTERNAL_SERVER_ERROR');
      assert.equal(result.error?.message, 'The post request could not be completed');
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
    const args = createPostRequest();
    const postCreateInputs: PostCreateActivityInput[] = [];
    const effectsStarted = Promise.withResolvers<void>();
    const releaseEffects = Promise.withResolvers<void>();
    let effectsCompleted = false;
    const worker = await createWorker(environment, taskQueue, {
      createPostActivityV2: async (input) => {
        postCreateInputs.push(input);
        return committedPost(input);
      },
      createNotificationActivity: async () => {},
      createReplyNotificationActivity: async () => [],
      sendLocalPostCreateActivity: async () => {
        effectsStarted.resolve();
        await releaseEffects.promise;
        effectsCompleted = true;
      },
    });

    await worker.runUntil(async () => {
      const handle = await startPostRequest(environment, taskQueue, args);
      const resultPromise = handle.result();
      await effectsStarted.promise;
      const result = await resultPromise;

      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.equal(result.result?.postId, args.postId);
      assert.equal(effectsCompleted, false);
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
      await effectsStarted.promise;
      const effectHandle = environment.client.workflow.getHandle(
        `post-create-effects:${args.postId}`,
      );
      await effectHandle.result();
      assert.equal(effectsCompleted, true);
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
    const args = withoutPostId(createPostRequest());
    const generatedPostId = randomUUID();
    const lateReconciliationStarted = Promise.withResolvers<void>();
    const releaseLateReconciliation = Promise.withResolvers<void>();
    let createAttempts = 0;
    let reconciliationAttempts = 0;
    let postIdGenerationCalls = 0;
    const postCreateInputs: PostCreateActivityInput[] = [];
    const worker = await createWorker(environment, taskQueue, {
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
      const result = await handle.result();
      assert.equal(result.status, PostRequestStatus.PUBLISHED);
      assert.equal(result.result?.postId, generatedPostId);
      assert.equal(createAttempts, 2);
      assert.equal(reconciliationAttempts, 2);
      assert.equal(postIdGenerationCalls, 1);
      assert.deepEqual(
        postCreateInputs.map(({ postId }) => postId),
        [generatedPostId, generatedPostId],
      );
    });
  },
);
