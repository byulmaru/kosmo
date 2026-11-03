import assert from 'node:assert/strict';
import test from 'node:test';
import { db, Media, Posts } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { temporalClient } from '@kosmo/core/temporal/client';
import { MEDIA_UPLOAD_PUBLISH_UPDATE_NAME } from '@kosmo/core/temporal/media-upload';
import { postCreateWorkflow } from '@kosmo/core/temporal/post-create';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  PostRequestStatus,
  postRequestWorkflow,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { ApplicationFailure, WorkflowUpdateFailedError } from '@temporalio/client';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';
import type {
  MediaUploadPublishInput,
  MediaUploadPublishResult,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';
import type { PostCreateWorkflowArgs } from '@kosmo/core/temporal/post-create';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';
import type { TestContext } from 'node:test';
import type { ExecutionResult } from 'graphql';

type CreatePostResult = {
  createPost: {
    post: { id: string } | null;
    request: { status: string } | null;
  };
};

const requestSubmit = (input: {
  bodyText: string;
  media?: readonly {
    applyAiProhibitFilter?: boolean;
    mediaId: string;
  }[];
  visibility: 'PUBLIC';
}) =>
  graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          post { id }
          request { status }
        }
      }
    `,
    variableValues: { input },
    contextValue: {
      session: {
        accountId: '00000000-0000-4000-8000-000000000001',
        profile: {
          id: '00000000-0000-4000-8000-000000000002',
          role: 'MEMBER',
        },
      },
    },
  }) as Promise<ExecutionResult<CreatePostResult>>;

const mockTemporalDeadline = (t: TestContext) =>
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

const setupMediaStorageHead = (t: TestContext) => {
  const previousOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
  const previousApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
  process.env.MEDIA_STORAGE_SERVICE_ORIGIN = 'https://storage.example';
  process.env.MEDIA_STORAGE_SERVICE_API_KEY = 'test-key';
  t.after(() => {
    if (previousOrigin === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_ORIGIN = previousOrigin;
    }
    if (previousApiKey === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_API_KEY;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_API_KEY = previousApiKey;
    }
  });
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(null, {
        status: 200,
        headers: {
          'content-length': '1',
          'content-type': 'image/png',
          'last-modified': new Date().toUTCString(),
        },
      }),
  );
};

const setupMediaRows = (
  t: TestContext,
  rows: readonly {
    id: string;
    source: MediaSource;
    state: MediaState;
    storageReference: string | null;
    url: string | null;
  }[],
  post?: { id: string; profileId: string },
) =>
  t.mock.method(
    db,
    'select',
    () =>
      ({
        from: (table: unknown) => {
          if (table === Media) {
            return { where: async () => rows };
          }
          assert.equal(table, Posts);
          assert.ok(post);
          return {
            where: () => ({
              limit: async (limit: number) => {
                assert.equal(limit, 1);
                return [post];
              },
            }),
          };
        },
      }) as never,
  );

const setupPublishUpdate = (
  t: TestContext,
  results: ReadonlyMap<string, MediaUploadPublishResult>,
) => {
  const calls: Array<{ input: MediaUploadPublishInput; mediaId: string }> = [];
  const mock = t.mock.method(
    temporalClient.workflow,
    'executeUpdateWithStart',
    async (updateName: unknown, options: unknown) => {
      assert.equal(updateName, MEDIA_UPLOAD_PUBLISH_UPDATE_NAME);
      const request = options as {
        args: readonly [MediaUploadPublishInput];
        startWorkflowOperation: {
          options: { args: readonly [{ mediaId: string }] };
        };
      };
      const input = request.args[0];
      const mediaId = request.startWorkflowOperation.options.args[0].mediaId;
      calls.push({ input, mediaId });
      const result = results.get(mediaId);
      assert.ok(result);
      return result as never;
    },
  );
  return { calls, mock };
};

test('createPost executes identical no-media submissions as separate PostCreate workflows', async (t) => {
  const profileId = '00000000-0000-4000-8000-000000000002';
  const postIds = [
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
  ];
  const workflowArgs: PostCreateWorkflowArgs[] = [];
  const postIdsForLookup = [...postIds];
  const execute = t.mock.method(
    temporalClient.workflow,
    'execute',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postCreateWorkflow.workflow);
      const request = options as {
        args: readonly [PostCreateWorkflowArgs];
        workflowId: string;
      };
      const args = request.args[0];
      workflowArgs.push(args);
      assert.equal(request.workflowId, `post-create:${args.requestId}`);
      const postId = postIds[workflowArgs.length - 1];
      assert.ok(postId);
      return { authorProfileId: profileId, postId, status: 'created' } as never;
    },
  );
  const start = t.mock.method(temporalClient.workflow, 'start');
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle');
  t.mock.method(
    db,
    'select',
    () =>
      ({
        from: (table: unknown) => {
          assert.equal(table, Posts);
          return {
            where: () => ({
              limit: async (limit: number) => {
                assert.equal(limit, 1);
                const postId = postIdsForLookup.shift();
                assert.ok(postId);
                return [{ id: postId, profileId }];
              },
            }),
          };
        },
      }) as never,
  );
  mockTemporalDeadline(t);

  const first = await requestSubmit({ bodyText: 'post body', visibility: 'PUBLIC' });
  const second = await requestSubmit({ bodyText: 'post body', visibility: 'PUBLIC' });
  assert.deepEqual(first.errors, undefined);
  assert.equal(first.data?.createPost.post?.id, encodeGlobalId('Post', postIds[0]));
  assert.equal(first.data?.createPost.request, null);
  assert.deepEqual(second.errors, undefined);
  assert.equal(second.data?.createPost.post?.id, encodeGlobalId('Post', postIds[1]));
  assert.equal(second.data?.createPost.request, null);

  assert.equal(execute.mock.callCount(), 2);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(getHandle.mock.callCount(), 0);
  assert.deepEqual(postIdsForLookup, []);
  const requestIds = workflowArgs.map(({ requestId }) => requestId);
  assert.ok(requestIds.every((requestId) => /^[0-9a-f-]{36}$/i.test(requestId)));
  assert.equal(new Set(requestIds).size, requestIds.length);
  assert.ok(workflowArgs.every(({ revalidateAuthorization }) => revalidateAuthorization === true));
  assert.ok(workflowArgs.every(({ input }) => input.profileId === profileId));
});

test('createPost rejects duplicate media before checking uploads or starting the workflow', async (t) => {
  const mediaId = '00000000-0000-4000-8000-000000000003';
  const uploadId = '00000000-0000-4000-8000-000000000005';
  const previousOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
  const previousApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
  process.env.MEDIA_STORAGE_SERVICE_ORIGIN = 'https://storage.example';
  process.env.MEDIA_STORAGE_SERVICE_API_KEY = 'test-key';
  t.after(() => {
    if (previousOrigin === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_ORIGIN = previousOrigin;
    }
    if (previousApiKey === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_API_KEY;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_API_KEY = previousApiKey;
    }
  });

  const select = t.mock.method(
    db,
    'select',
    () =>
      ({
        from: () => ({
          where: async () => [
            {
              id: mediaId,
              source: MediaSource.LOCAL,
              state: MediaState.UPLOADING,
              storageReference: `nexus:v1:${uploadId}`,
              url: null,
            },
          ],
        }),
      }) as never,
  );
  const headRequests: Array<{ method: string | undefined; url: string }> = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    headRequests.push({ method: init?.method, url: String(input) });
    return new Response(null, {
      status: 200,
      headers: {
        'content-length': '1',
        'content-type': 'image/png',
        'last-modified': new Date().toUTCString(),
      },
    });
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );
  const start = t.mock.method(temporalClient.workflow, 'start');
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const publish = t.mock.method(temporalClient.workflow, 'executeUpdateWithStart');

  const encodedMediaId = encodeGlobalId('Media', mediaId);
  const result = await requestSubmit({
    bodyText: 'duplicate image',
    media: [
      { applyAiProhibitFilter: false, mediaId: encodedMediaId },
      { applyAiProhibitFilter: true, mediaId: encodedMediaId },
    ],
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'media');
  assert.equal(error.code, 'VALIDATION');
  assert.deepEqual(headRequests, []);
  assert.equal(select.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(publish.mock.callCount(), 0);
});

test('createPost creates a Post after a completed Media publication', async (t) => {
  const mediaId = '00000000-0000-4000-8000-000000000003';
  const uploadId = '00000000-0000-4000-8000-000000000004';
  const postId = '00000000-0000-4000-8000-000000000005';
  const profileId = '00000000-0000-4000-8000-000000000002';
  setupMediaStorageHead(t);
  const select = setupMediaRows(
    t,
    [
      {
        id: mediaId,
        source: MediaSource.LOCAL,
        state: MediaState.UPLOADING,
        storageReference: 'nexus:v1:' + uploadId,
        url: null,
      },
    ],
    { id: postId, profileId },
  );
  const publish = setupPublishUpdate(
    t,
    new Map<string, MediaUploadPublishResult>([
      [
        mediaId,
        {
          status: 'completed',
          id: mediaId,
          url: 'https://media.example/complete.webp',
          mediaType: 'image/webp',
        },
      ],
    ]),
  );
  const workflowArgs: PostCreateWorkflowArgs[] = [];
  const execute = t.mock.method(
    temporalClient.workflow,
    'execute',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postCreateWorkflow.workflow);
      const args = (options as { args: readonly [PostCreateWorkflowArgs] }).args[0];
      workflowArgs.push(args);
      return { authorProfileId: profileId, postId, status: 'created' } as never;
    },
  );
  const start = t.mock.method(temporalClient.workflow, 'start');
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle');
  mockTemporalDeadline(t);

  const result = await requestSubmit({
    bodyText: 'completed upload',
    media: [{ applyAiProhibitFilter: true, mediaId: encodeGlobalId('Media', mediaId) }],
    visibility: 'PUBLIC',
  });

  assert.deepEqual(result.errors, undefined);
  assert.equal(result.data?.createPost.post?.id, encodeGlobalId('Post', postId));
  assert.equal(result.data?.createPost.request, null);
  assert.deepEqual(publish.calls, [
    { input: { applyAiProhibitFilter: true }, mediaId },
  ]);
  assert.equal(publish.mock.callCount(), 1);
  assert.equal(execute.mock.callCount(), 1);
  assert.equal(workflowArgs[0]?.revalidateAuthorization, true);
  assert.equal(workflowArgs[0]?.input.profileId, profileId);
  assert.deepEqual(workflowArgs[0]?.input.media, [{ altText: null, mediaId }]);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(getHandle.mock.callCount(), 0);
  assert.equal(select.mock.callCount(), 2);
});

test('createPost queues a request for mixed Media when one publication is processing', async (t) => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const profileId = '00000000-0000-4000-8000-000000000002';
  const completedMediaId = '00000000-0000-4000-8000-000000000003';
  const processingMediaId = '00000000-0000-4000-8000-000000000004';
  const completedUploadId = '00000000-0000-4000-8000-000000000005';
  const processingUploadId = '00000000-0000-4000-8000-000000000006';
  setupMediaStorageHead(t);
  const select = setupMediaRows(t, [
    {
      id: completedMediaId,
      source: MediaSource.LOCAL,
      state: MediaState.UPLOADING,
      storageReference: 'nexus:v1:' + completedUploadId,
      url: null,
    },
    {
      id: processingMediaId,
      source: MediaSource.LOCAL,
      state: MediaState.UPLOADING,
      storageReference: 'nexus:v1:' + processingUploadId,
      url: null,
    },
  ]);
  const publish = setupPublishUpdate(
    t,
    new Map<string, MediaUploadPublishResult>([
      [
        completedMediaId,
        {
          status: 'completed',
          id: completedMediaId,
          url: 'https://media.example/complete.webp',
          mediaType: 'image/webp',
        },
      ],
      [processingMediaId, { status: 'processing', id: processingMediaId }],
    ]),
  );
  const execute = t.mock.method(temporalClient.workflow, 'execute', async () => {
    throw new Error('A processing Media must not create a Post');
  });
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle', () => {
    throw new Error('PostRequest submission must not wait for its result');
  });
  const started: Array<{
    args?: readonly [PostRequestState['snapshot']];
    workflowId?: string;
    typedSearchAttributes?: readonly { key: { name: string; type: string }; value: string }[];
    workflowIdConflictPolicy?: string;
    workflowIdReusePolicy?: string;
  }> = [];
  const start = t.mock.method(
    temporalClient.workflow,
    'start',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postRequestWorkflow.workflow);
      const workflowOptions = options as (typeof started)[number];
      started.push(workflowOptions);
      return { workflowId: workflowOptions.workflowId } as never;
    },
  );
  mockTemporalDeadline(t);

  const result = await requestSubmit({
    bodyText: 'mixed uploads',
    media: [
      { applyAiProhibitFilter: true, mediaId: encodeGlobalId('Media', completedMediaId) },
      { mediaId: encodeGlobalId('Media', processingMediaId) },
    ],
    visibility: 'PUBLIC',
  });

  assert.deepEqual(result.errors, undefined);
  assert.equal(result.data?.createPost.post, null);
  assert.equal(result.data?.createPost.request?.status, PostRequestStatus.QUEUED);
  assert.deepEqual(publish.calls, [
    { input: { applyAiProhibitFilter: true }, mediaId: completedMediaId },
    { input: { applyAiProhibitFilter: false }, mediaId: processingMediaId },
  ]);
  assert.equal(publish.mock.callCount(), 2);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 1);
  assert.equal(getHandle.mock.callCount(), 0);
  assert.equal(select.mock.callCount(), 1);

  const snapshot = started[0]?.args?.[0];
  assert.ok(snapshot);
  assert.match(snapshot.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(started[0]?.workflowId, postRequestWorkflowId(accountId, snapshot.requestId));
  assert.equal(started[0]?.workflowIdConflictPolicy, 'FAIL');
  assert.equal(started[0]?.workflowIdReusePolicy, 'REJECT_DUPLICATE');
  assert.deepEqual(snapshot.input.media, [
    { altText: null, applyNightshade: true, mediaId: completedMediaId },
    { altText: null, applyNightshade: false, mediaId: processingMediaId },
  ]);
  assert.deepEqual(started[0]?.typedSearchAttributes, [
    {
      key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId, type: 'KEYWORD' },
      value: accountId,
    },
    {
      key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.profileId, type: 'KEYWORD' },
      value: profileId,
    },
    {
      key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.status, type: 'KEYWORD' },
      value: 'QUEUED',
    },
  ]);
});

test('createPost trusts retained READY Media results and rejects unknown or mismatched filter state', async (t) => {
  const matchingMediaId = '00000000-0000-4000-8000-000000000003';
  const mismatchedMediaId = '00000000-0000-4000-8000-000000000004';
  const unknownMediaId = '00000000-0000-4000-8000-000000000005';
  const postId = '00000000-0000-4000-8000-000000000006';
  const profileId = '00000000-0000-4000-8000-000000000002';
  const select = setupMediaRows(
    t,
    [matchingMediaId, mismatchedMediaId, unknownMediaId].map((id) => ({
      id,
      source: MediaSource.LOCAL,
      state: MediaState.READY,
      storageReference: null,
      url: 'https://media.example/ready.webp',
    })),
    { id: postId, profileId },
  );
  const retainedResults: Array<MediaUploadWorkflowResult | null> = [
    {
      id: matchingMediaId,
      url: 'https://media.example/matching.webp',
      mediaType: 'image/webp',
      applyAiProhibitFilter: true,
    },
    {
      id: mismatchedMediaId,
      url: 'https://media.example/mismatched.webp',
      mediaType: 'image/webp',
      applyAiProhibitFilter: false,
    },
    null,
  ];
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle', () => {
    const result = retainedResults.shift();
    assert.notEqual(result, undefined);
    return { result: async () => result as never } as never;
  });
  const workflowArgs: PostCreateWorkflowArgs[] = [];
  const execute = t.mock.method(
    temporalClient.workflow,
    'execute',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postCreateWorkflow.workflow);
      workflowArgs.push((options as { args: readonly [PostCreateWorkflowArgs] }).args[0]);
      return { authorProfileId: profileId, postId, status: 'created' } as never;
    },
  );
  const start = t.mock.method(temporalClient.workflow, 'start');
  const publish = t.mock.method(temporalClient.workflow, 'executeUpdateWithStart');
  mockTemporalDeadline(t);

  const matchingResult = await requestSubmit({
    bodyText: 'retained filter',
    media: [{ applyAiProhibitFilter: true, mediaId: encodeGlobalId('Media', matchingMediaId) }],
    visibility: 'PUBLIC',
  });
  assert.deepEqual(matchingResult.errors, undefined);
  assert.equal(matchingResult.data?.createPost.post?.id, encodeGlobalId('Post', postId));
  assert.equal(matchingResult.data?.createPost.request, null);

  const mismatchedResult = await requestSubmit({
    bodyText: 'different filter',
    media: [{ applyAiProhibitFilter: true, mediaId: encodeGlobalId('Media', mismatchedMediaId) }],
    visibility: 'PUBLIC',
  });
  const mismatchError = mismatchedResult.errors?.[0]?.originalError;
  assert.ok(mismatchError instanceof ValidationError);
  assert.equal(mismatchError.field, 'media.0');

  const unknownResult = await requestSubmit({
    bodyText: 'unknown filter',
    media: [{ applyAiProhibitFilter: true, mediaId: encodeGlobalId('Media', unknownMediaId) }],
    visibility: 'PUBLIC',
  });
  const unknownError = unknownResult.errors?.[0]?.originalError;
  assert.ok(unknownError instanceof ValidationError);
  assert.equal(unknownError.field, 'media.0');

  assert.equal(getHandle.mock.callCount(), 3);
  assert.equal(select.mock.callCount(), 4);
  assert.equal(execute.mock.callCount(), 1);
  assert.equal(workflowArgs.length, 1);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(publish.mock.callCount(), 0);
});

test('createPost maps nested Media selection conflicts and preserves unrelated publish errors', async (t) => {
  const conflictMediaId = '00000000-0000-4000-8000-000000000003';
  const unrelatedMediaId = '00000000-0000-4000-8000-000000000004';
  const conflictUploadId = '00000000-0000-4000-8000-000000000005';
  const unrelatedUploadId = '00000000-0000-4000-8000-000000000006';
  setupMediaStorageHead(t);
  const select = setupMediaRows(t, [
    {
      id: conflictMediaId,
      source: MediaSource.LOCAL,
      state: MediaState.UPLOADING,
      storageReference: 'nexus:v1:' + conflictUploadId,
      url: null,
    },
    {
      id: unrelatedMediaId,
      source: MediaSource.LOCAL,
      state: MediaState.UPLOADING,
      storageReference: 'nexus:v1:' + unrelatedUploadId,
      url: null,
    },
  ]);
  const conflict = ApplicationFailure.nonRetryable(
    'Media upload filter does not match',
    'MediaUploadSelectionConflict',
  );
  const unrelated = new Error('Media publication failed');
  const failures: Error[] = [
    new WorkflowUpdateFailedError('Update failed', conflict),
    unrelated,
  ];
  const publish = t.mock.method(
    temporalClient.workflow,
    'executeUpdateWithStart',
    async (updateName: unknown) => {
      assert.equal(updateName, MEDIA_UPLOAD_PUBLISH_UPDATE_NAME);
      const failure = failures.shift();
      assert.ok(failure);
      throw failure;
    },
  );
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const start = t.mock.method(temporalClient.workflow, 'start');
  mockTemporalDeadline(t);

  const conflictResult = await requestSubmit({
    bodyText: 'conflicting selection',
    media: [
      { applyAiProhibitFilter: true, mediaId: encodeGlobalId('Media', conflictMediaId) },
    ],
    visibility: 'PUBLIC',
  });
  const conflictError = conflictResult.errors?.[0]?.originalError;
  assert.ok(conflictError instanceof ValidationError);
  assert.equal(conflictError.field, 'media.0');

  const unrelatedResult = await requestSubmit({
    bodyText: 'unrelated failure',
    media: [
      { applyAiProhibitFilter: false, mediaId: encodeGlobalId('Media', unrelatedMediaId) },
    ],
    visibility: 'PUBLIC',
  });
  assert.equal(unrelatedResult.errors?.[0]?.originalError, unrelated);
  assert.equal(publish.mock.callCount(), 2);
  assert.equal(select.mock.callCount(), 2);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
});

test('createPost does not admit an Uploading Media whose raw upload is missing', async (t) => {
  const mediaId = '00000000-0000-4000-8000-000000000003';
  const uploadId = '00000000-0000-4000-8000-000000000005';
  const previousOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
  const previousApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
  process.env.MEDIA_STORAGE_SERVICE_ORIGIN = 'https://storage.example';
  process.env.MEDIA_STORAGE_SERVICE_API_KEY = 'test-key';
  t.after(() => {
    if (previousOrigin === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_ORIGIN = previousOrigin;
    }
    if (previousApiKey === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_API_KEY;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_API_KEY = previousApiKey;
    }
  });

  t.mock.method(
    db,
    'select',
    () =>
      ({
        from: () => ({
          where: async () => [
            {
              id: mediaId,
              source: MediaSource.LOCAL,
              state: MediaState.UPLOADING,
              storageReference: `nexus:v1:${uploadId}`,
              url: null,
            },
          ],
        }),
      }) as never,
  );
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  const start = t.mock.method(temporalClient.workflow, 'start');
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const publish = t.mock.method(temporalClient.workflow, 'executeUpdateWithStart');
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await requestSubmit({
    bodyText: 'image without bytes',
    media: [{ mediaId: encodeGlobalId('Media', mediaId) }],
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'media.0');
  assert.equal(error.code, 'VALIDATION');
  assert.equal(start.mock.callCount(), 0);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(publish.mock.callCount(), 0);
});

test('createPost reports unsupported uploads by their original media index', async (t) => {
  const readyMediaId = '00000000-0000-4000-8000-000000000003';
  const uploadingMediaId = '00000000-0000-4000-8000-000000000004';
  const select = t.mock.method(
    db,
    'select',
    () =>
      ({
        from: () => ({
          where: async () => [
            {
              id: readyMediaId,
              source: MediaSource.LOCAL,
              state: MediaState.READY,
              storageReference: null,
              url: 'https://media.example/ready.webp',
            },
            {
              id: uploadingMediaId,
              source: MediaSource.LOCAL,
              state: MediaState.UPLOADING,
              storageReference: `legacy:${crypto.randomUUID()}`,
              url: null,
            },
          ],
        }),
      }) as never,
  );
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle', () => ({
    result: async () => null as never,
  }) as never);
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const start = t.mock.method(temporalClient.workflow, 'start');
  const publish = t.mock.method(temporalClient.workflow, 'executeUpdateWithStart');
  mockTemporalDeadline(t);

  const result = await requestSubmit({
    bodyText: 'two images',
    media: [
      { mediaId: encodeGlobalId('Media', readyMediaId) },
      { mediaId: encodeGlobalId('Media', uploadingMediaId) },
    ],
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'media.1');
  assert.equal(error.code, 'VALIDATION');
  assert.equal(select.mock.callCount(), 1);
  assert.equal(getHandle.mock.callCount(), 1);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(publish.mock.callCount(), 0);
});

test('createPost leaves storage outages unknown and does not mark a media slot missing', async (t) => {
  const readyMediaId = '00000000-0000-4000-8000-000000000003';
  const uploadingMediaId = '00000000-0000-4000-8000-000000000004';
  const uploadId = '00000000-0000-4000-8000-000000000005';
  const previousOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
  const previousApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
  process.env.MEDIA_STORAGE_SERVICE_ORIGIN = 'https://storage.example';
  process.env.MEDIA_STORAGE_SERVICE_API_KEY = 'test-key';
  t.after(() => {
    if (previousOrigin === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_ORIGIN = previousOrigin;
    }
    if (previousApiKey === undefined) {
      delete process.env.MEDIA_STORAGE_SERVICE_API_KEY;
    } else {
      process.env.MEDIA_STORAGE_SERVICE_API_KEY = previousApiKey;
    }
  });

  const select = t.mock.method(
    db,
    'select',
    () =>
      ({
        from: () => ({
          where: async () => [
            {
              id: readyMediaId,
              source: MediaSource.LOCAL,
              state: MediaState.READY,
              storageReference: null,
              url: 'https://media.example/ready.webp',
            },
            {
              id: uploadingMediaId,
              source: MediaSource.LOCAL,
              state: MediaState.UPLOADING,
              storageReference: `nexus:v1:${uploadId}`,
              url: null,
            },
          ],
        }),
      }) as never,
  );
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle', () => ({
    result: async () => null as never,
  }) as never);
  const outage = new Error('Media Storage Service is unreachable');
  t.mock.method(globalThis, 'fetch', async () => {
    throw outage;
  });
  const start = t.mock.method(temporalClient.workflow, 'start');
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const publish = t.mock.method(temporalClient.workflow, 'executeUpdateWithStart');
  mockTemporalDeadline(t);

  const result = await requestSubmit({
    bodyText: 'two images',
    media: [
      { mediaId: encodeGlobalId('Media', readyMediaId) },
      { mediaId: encodeGlobalId('Media', uploadingMediaId) },
    ],
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.equal(error, outage);
  assert.equal(result.errors?.[0]?.extensions.field, undefined);
  assert.equal(select.mock.callCount(), 1);
  assert.equal(getHandle.mock.callCount(), 1);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(publish.mock.callCount(), 0);
});

test('createPost returns a PostRequest start error without querying request state', async (t) => {
  const mediaId = '00000000-0000-4000-8000-000000000003';
  const uploadId = '00000000-0000-4000-8000-000000000004';
  setupMediaStorageHead(t);
  setupMediaRows(t, [
    {
      id: mediaId,
      source: MediaSource.LOCAL,
      state: MediaState.UPLOADING,
      storageReference: 'nexus:v1:' + uploadId,
      url: null,
    },
  ]);
  const publish = setupPublishUpdate(
    t,
    new Map<string, MediaUploadPublishResult>([[mediaId, { status: 'processing', id: mediaId }]]),
  );
  const admissionFailure = new Error('Temporal start acknowledgement was lost');
  const start = t.mock.method(temporalClient.workflow, 'start', async () => {
    throw admissionFailure;
  });
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle');
  mockTemporalDeadline(t);

  const result = await requestSubmit({
    bodyText: 'post body',
    media: [{ mediaId: encodeGlobalId('Media', mediaId) }],
    visibility: 'PUBLIC',
  });

  assert.equal(result.errors?.[0]?.originalError, admissionFailure);
  assert.equal(publish.mock.callCount(), 1);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 1);
  assert.equal(getHandle.mock.callCount(), 0);
});
