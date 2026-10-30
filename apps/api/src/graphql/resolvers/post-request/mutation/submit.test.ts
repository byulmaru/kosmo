import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { ConflictError, ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  POST_REQUEST_STATE_QUERY,
  POST_REQUEST_WORKFLOW_TYPE,
  PostRequestStatus,
  postRequestWorkflow,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { graphql } from 'graphql';
import { schema } from '@/graphql/schema';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';
import type { ExecutionResult } from 'graphql';

type CreatePostResult = {
  createPost: {
    request: { status: string } | null;
  };
};

const requestSubmit = (input: {
  bodyText: string;
  media?: readonly { applyNightshade?: boolean; mediaId: string }[];
  requestId: string;
  visibility: 'PUBLIC';
}) =>
  graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
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

const noExistingPostRequestHandle = {
  query: async (queryName: string) => {
    assert.equal(queryName, POST_REQUEST_STATE_QUERY);
    return null;
  },
};

test('createPost rejects duplicate media before checking uploads or starting the workflow', async (t) => {
  t.mock.method(temporalClient.workflow, 'getHandle', () => noExistingPostRequestHandle as never);
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

  const encodedMediaId = encodeGlobalId('Media', mediaId);
  const result = await requestSubmit({
    bodyText: 'duplicate image',
    media: [
      { applyNightshade: false, mediaId: encodedMediaId },
      { applyNightshade: true, mediaId: encodedMediaId },
    ],
    requestId: '00000000-0000-4000-8000-000000000006',
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'media');
  assert.equal(error.code, 'VALIDATION');
  assert.deepEqual(headRequests, []);
  assert.equal(start.mock.callCount(), 0);
});

test('createPost checks raw uploads before start and keeps READY media choices in the snapshot', async (t) => {
  const query = t.mock.fn(async (queryName: string) => {
    assert.equal(queryName, POST_REQUEST_STATE_QUERY);
    return null;
  });
  t.mock.method(temporalClient.workflow, 'getHandle', () => ({ query }) as never);
  const accountId = '00000000-0000-4000-8000-000000000001';
  const uploadingMediaId = '00000000-0000-4000-8000-000000000003';
  const readyMediaId = '00000000-0000-4000-8000-000000000004';
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

  const rows = [
    {
      id: uploadingMediaId,
      source: MediaSource.LOCAL,
      state: MediaState.UPLOADING,
      storageReference: `nexus:v1:${uploadId}`,
      url: null,
    },
    {
      id: readyMediaId,
      source: MediaSource.LOCAL,
      state: MediaState.READY,
      storageReference: null,
      url: 'https://media.example/ready.webp',
    },
  ];
  t.mock.method(
    db,
    'select',
    () =>
      ({
        from: () => ({ where: async () => rows }),
      }) as never,
  );
  const execute = t.mock.method(db, 'execute', async () => {
    throw new Error('Post request submission must not generate a Post ID');
  });

  const metadataRequests: Array<{ method: string | undefined; url: string }> = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    metadataRequests.push({ method: init?.method, url: String(input) });
    return new Response(null, {
      status: 200,
      headers: {
        'content-length': '1',
        'content-type': 'image/png',
        'last-modified': new Date().toUTCString(),
      },
    });
  });

  const started: Array<{
    args?: readonly {
      input: {
        media?: readonly { altText: string | null; applyNightshade: boolean; mediaId: string }[];
      };
      postId?: string;
      requestId: string;
      submittedAt: string;
      submissionFingerprint?: string;
    }[];
    typedSearchAttributes?: readonly { key: { name: string; type: string }; value: string }[];
    workflowIdConflictPolicy?: string;
    workflowIdReusePolicy?: string;
  }> = [];
  const executeWorkflow = t.mock.method(temporalClient.workflow, 'execute', async () => {
    throw new Error('Request creation must return after start acknowledgement');
  });
  t.mock.method(temporalClient.workflow, 'start', async (workflow: unknown, options: unknown) => {
    assert.equal(workflow, postRequestWorkflow.workflow);
    assert.ok(options && typeof options === 'object');
    started.push(options as (typeof started)[number]);
    return { workflowId: 'post-request', firstExecutionRunId: 'run-1' } as never;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const uploadingResult = await requestSubmit({
    bodyText: 'uploading image',
    media: [{ applyNightshade: true, mediaId: encodeGlobalId('Media', uploadingMediaId) }],
    requestId: '00000000-0000-4000-8000-000000000006',
    visibility: 'PUBLIC',
  });
  assert.deepEqual(uploadingResult.errors, undefined);
  assert.equal(uploadingResult.data?.createPost.request?.status, 'QUEUED');
  assert.deepEqual(metadataRequests, [
    {
      method: 'HEAD',
      url: `https://storage.example/v1/uploads/u_${uploadId}?staging=true`,
    },
  ]);
  assert.deepEqual(started[0]?.args?.[0]?.input.media, [
    { altText: null, applyNightshade: true, mediaId: uploadingMediaId },
  ]);
  assert.equal(started[0]?.args?.[0]?.postId, undefined);
  assert.ok(started[0]?.args?.[0]?.submittedAt);
  assert.equal(started[0]?.workflowIdConflictPolicy, 'FAIL');
  assert.equal(started[0]?.workflowIdReusePolicy, 'REJECT_DUPLICATE');
  assert.match(started[0]?.args?.[0]?.submissionFingerprint ?? '', /^[a-f0-9]{64}$/);
  assert.deepEqual(started[0]?.typedSearchAttributes, [
    {
      key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.ownerAccountId, type: 'KEYWORD' },
      value: accountId,
    },
    {
      key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.profileId, type: 'KEYWORD' },
      value: '00000000-0000-4000-8000-000000000002',
    },
    {
      key: { name: POST_REQUEST_SEARCH_ATTRIBUTES.status, type: 'KEYWORD' },
      value: 'QUEUED',
    },
  ]);

  const readyResult = await requestSubmit({
    bodyText: 'ready image',
    media: [{ mediaId: encodeGlobalId('Media', readyMediaId) }],
    requestId: '00000000-0000-4000-8000-000000000007',
    visibility: 'PUBLIC',
  });
  assert.deepEqual(readyResult.errors, undefined);
  assert.equal(readyResult.data?.createPost.request?.status, 'QUEUED');
  assert.equal(metadataRequests.length, 1);
  assert.deepEqual(started[1]?.args?.[0]?.input.media, [
    { altText: null, applyNightshade: false, mediaId: readyMediaId },
  ]);
  assert.equal(started[1]?.args?.[0]?.postId, undefined);
  assert.equal(query.mock.callCount(), 2);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(executeWorkflow.mock.callCount(), 0);
});

test('createPost does not admit an Uploading Media whose raw upload is missing', async (t) => {
  t.mock.method(temporalClient.workflow, 'getHandle', () => noExistingPostRequestHandle as never);
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
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await requestSubmit({
    bodyText: 'image without bytes',
    media: [{ applyNightshade: false, mediaId: encodeGlobalId('Media', mediaId) }],
    requestId: '00000000-0000-4000-8000-000000000006',
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'media.0');
  assert.equal(error.code, 'VALIDATION');
  assert.equal(start.mock.callCount(), 0);
});

test('createPost reports unsupported uploads by their original media index', async (t) => {
  t.mock.method(temporalClient.workflow, 'getHandle', () => noExistingPostRequestHandle as never);
  const readyMediaId = '00000000-0000-4000-8000-000000000003';
  const uploadingMediaId = '00000000-0000-4000-8000-000000000004';
  t.mock.method(
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
  const start = t.mock.method(temporalClient.workflow, 'start');

  const result = await requestSubmit({
    bodyText: 'two images',
    media: [
      { applyNightshade: false, mediaId: encodeGlobalId('Media', readyMediaId) },
      { applyNightshade: false, mediaId: encodeGlobalId('Media', uploadingMediaId) },
    ],
    requestId: '00000000-0000-4000-8000-000000000006',
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'media.1');
  assert.equal(error.code, 'VALIDATION');
  assert.equal(start.mock.callCount(), 0);
});

test('createPost leaves storage outages unknown and does not mark a media slot missing', async (t) => {
  t.mock.method(temporalClient.workflow, 'getHandle', () => noExistingPostRequestHandle as never);
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

  t.mock.method(
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
  const outage = new Error('Media Storage Service is unreachable');
  t.mock.method(globalThis, 'fetch', async () => {
    throw outage;
  });
  const start = t.mock.method(temporalClient.workflow, 'start');

  const result = await requestSubmit({
    bodyText: 'two images',
    media: [
      { applyNightshade: false, mediaId: encodeGlobalId('Media', readyMediaId) },
      { applyNightshade: false, mediaId: encodeGlobalId('Media', uploadingMediaId) },
    ],
    requestId: '00000000-0000-4000-8000-000000000006',
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.equal(error, outage);
  assert.equal(result.errors?.[0]?.extensions.field, undefined);
  assert.equal(start.mock.callCount(), 0);
});

test('createPost recovers a lost acknowledgement after an upload source disappears without reopening FAILED requests', async (t) => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const mediaId = '00000000-0000-4000-8000-000000000003';
  const uploadId = '00000000-0000-4000-8000-000000000004';
  const requestId = '00000000-0000-4000-8000-000000000005';
  const workflowId = postRequestWorkflowId(accountId, requestId);
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

  let current: PostRequestState | null = null;
  let queryCount = 0;
  const readCurrent = (): PostRequestState | null => current;
  t.mock.method(temporalClient.workflow, 'getHandle', (id: string) => {
    assert.equal(id, workflowId);
    return {
      query: async (queryName: string) => {
        assert.equal(queryName, POST_REQUEST_STATE_QUERY);
        queryCount += 1;
        return current;
      },
    } as never;
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
  let fetchCount = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    fetchCount += 1;
    return fetchCount === 1
      ? new Response(null, {
          status: 200,
          headers: {
            'content-length': '1',
            'content-type': 'image/png',
            'last-modified': new Date().toUTCString(),
          },
        })
      : new Response(null, { status: 404 });
  });
  let startCount = 0;
  t.mock.method(temporalClient.workflow, 'start', async (workflow: unknown, options: unknown) => {
    assert.equal(workflow, postRequestWorkflow.workflow);
    const workflowOptions = options as {
      workflowIdConflictPolicy?: string;
      workflowIdReusePolicy?: string;
    };
    assert.equal(workflowOptions.workflowIdConflictPolicy, 'FAIL');
    assert.equal(workflowOptions.workflowIdReusePolicy, 'REJECT_DUPLICATE');
    startCount += 1;
    const snapshot = (options as { args: readonly [PostRequestState['snapshot']] }).args[0];
    current = { snapshot, status: PostRequestStatus.QUEUED };
    return { workflowId, firstExecutionRunId: 'run-1' } as never;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const input = {
    bodyText: 'same content',
    media: [{ applyNightshade: true, mediaId: encodeGlobalId('Media', mediaId) }],
    requestId,
    visibility: 'PUBLIC' as const,
  };
  const initial = await requestSubmit(input);
  assert.deepEqual(initial.errors, undefined);
  assert.equal(initial.data?.createPost.request?.status, 'QUEUED');

  const currentAfterStart = readCurrent();
  assert.ok(currentAfterStart);
  const publishedPostId = '00000000-0000-4000-8000-000000000099';
  current = {
    ...currentAfterStart,
    result: { postId: publishedPostId },
    status: PostRequestStatus.PUBLISHED,
  };
  const replay = await requestSubmit(input);
  assert.deepEqual(replay.errors, undefined);
  assert.equal(replay.data?.createPost.request?.status, 'PUBLISHED');
  current = { ...currentAfterStart, status: PostRequestStatus.FAILED };
  const failedReplay = await requestSubmit(input);
  assert.deepEqual(failedReplay.errors, undefined);
  assert.equal(failedReplay.data?.createPost.request?.status, 'FAILED');
  assert.equal(queryCount, 3);
  assert.equal(fetchCount, 1);
  assert.equal(select.mock.callCount(), 1);
  assert.equal(startCount, 1);
});

test('createPost confirms a matching racing start and rejects different content', async (t) => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const requestId = '00000000-0000-4000-8000-000000000006';
  const workflowId = postRequestWorkflowId(accountId, requestId);
  let current: PostRequestState | null = null;
  let queryCount = 0;
  t.mock.method(temporalClient.workflow, 'getHandle', (id: string) => {
    assert.equal(id, workflowId);
    return {
      query: async (queryName: string) => {
        assert.equal(queryName, POST_REQUEST_STATE_QUERY);
        queryCount += 1;
        return current;
      },
    } as never;
  });
  const start = t.mock.method(
    temporalClient.workflow,
    'start',
    async (_workflow: unknown, options: unknown) => {
      const snapshot = (options as { args: readonly [PostRequestState['snapshot']] }).args[0];
      current = { snapshot, status: PostRequestStatus.PROCESSING };
      throw new WorkflowExecutionAlreadyStartedError(
        'Workflow execution already started',
        workflowId,
        POST_REQUEST_WORKFLOW_TYPE,
      );
    },
  );
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const matching = await requestSubmit({
    bodyText: 'same content',
    requestId,
    visibility: 'PUBLIC',
  });
  assert.deepEqual(matching.errors, undefined);
  assert.equal(matching.data?.createPost.request?.status, 'PROCESSING');

  const changed = await requestSubmit({
    bodyText: 'changed content',
    requestId,
    visibility: 'PUBLIC',
  });
  assert.equal(
    changed.errors?.[0]?.message,
    'This request ID already belongs to different post content',
  );
  assert.ok(changed.errors?.[0]?.originalError instanceof ConflictError);
  assert.equal(start.mock.callCount(), 1);
  assert.equal(queryCount, 3);
  assert.equal((changed.errors?.[0]?.originalError as ConflictError).field, 'requestId');
});
