import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  POST_REQUEST_SEARCH_ATTRIBUTES,
  PostRequestStatus,
  postRequestWorkflow,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
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

test('createPost admits identical submissions as separate requests', async (t) => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const results = new Map<string, PostRequestState>();
  const startedSnapshots: PostRequestState['snapshot'][] = [];
  let resultCallCount = 0;
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    (workflowId: string) =>
      ({
        result: async () => {
          resultCallCount += 1;
          const result = results.get(workflowId);
          assert.ok(result);
          return result;
        },
      }) as never,
  );
  const start = t.mock.method(
    temporalClient.workflow,
    'start',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postRequestWorkflow.workflow);
      const snapshot = (options as { args: readonly [PostRequestState['snapshot']] }).args[0];
      startedSnapshots.push(snapshot);
      const workflowId = postRequestWorkflowId(accountId, snapshot.requestId);
      results.set(workflowId, {
        snapshot,
        status: PostRequestStatus.PUBLISHED,
        result: { postId: crypto.randomUUID() },
      });
      return { workflowId } as never;
    },
  );
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const first = await requestSubmit({ bodyText: 'post body', visibility: 'PUBLIC' });
  const second = await requestSubmit({ bodyText: 'post body', visibility: 'PUBLIC' });
  assert.deepEqual(first.errors, undefined);
  assert.equal(first.data?.createPost.request?.status, PostRequestStatus.PUBLISHED);
  assert.deepEqual(second.errors, undefined);
  assert.equal(second.data?.createPost.request?.status, PostRequestStatus.PUBLISHED);

  assert.equal(start.mock.callCount(), 2);
  assert.equal(resultCallCount, 2);
  const requestIds = startedSnapshots.map(({ requestId }) => requestId);
  assert.ok(requestIds.every((requestId) => /^[0-9a-f-]{36}$/i.test(requestId)));
  assert.equal(new Set(requestIds).size, requestIds.length);
  assert.ok(
    startedSnapshots.every(({ submissionFingerprint }) => submissionFingerprint === undefined),
  );
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
  assert.equal(start.mock.callCount(), 0);
});

test('createPost checks raw uploads, acknowledges pending media, and waits for READY media', async (t) => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const results = new Map<string, PostRequestState>();
  let resultCallCount = 0;
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    (workflowId: string) =>
      ({
        result: async () => {
          resultCallCount += 1;
          const result = results.get(workflowId);
          assert.ok(result);
          return result;
        },
      }) as never,
  );
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
    args?: readonly [PostRequestState['snapshot']];
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
    const workflowOptions = options as (typeof started)[number];
    started.push(workflowOptions);
    const snapshot = workflowOptions.args?.[0];
    assert.ok(snapshot);
    const workflowId = postRequestWorkflowId(accountId, snapshot.requestId);
    results.set(workflowId, {
      snapshot,
      status: PostRequestStatus.PUBLISHED,
      result: { postId: crypto.randomUUID() },
    });
    return { workflowId, firstExecutionRunId: 'run-1' } as never;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const uploadingResult = await requestSubmit({
    bodyText: 'uploading image',
    media: [
      {
        applyAiProhibitFilter: true,
        mediaId: encodeGlobalId('Media', uploadingMediaId),
      },
    ],
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
  assert.equal(started[0]?.args?.[0]?.submissionFingerprint, undefined);
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
    visibility: 'PUBLIC',
  });
  assert.deepEqual(readyResult.errors, undefined);
  assert.equal(readyResult.data?.createPost.request?.status, 'PUBLISHED');
  assert.equal(metadataRequests.length, 1);
  assert.deepEqual(started[1]?.args?.[0]?.input.media, [
    { altText: null, applyNightshade: false, mediaId: readyMediaId },
  ]);
  assert.equal(started[1]?.args?.[0]?.postId, undefined);
  assert.equal(resultCallCount, 1);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(executeWorkflow.mock.callCount(), 0);
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
});

test('createPost reports unsupported uploads by their original media index', async (t) => {
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
      { mediaId: encodeGlobalId('Media', readyMediaId) },
      { mediaId: encodeGlobalId('Media', uploadingMediaId) },
    ],
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'media.1');
  assert.equal(error.code, 'VALIDATION');
  assert.equal(start.mock.callCount(), 0);
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
      { mediaId: encodeGlobalId('Media', readyMediaId) },
      { mediaId: encodeGlobalId('Media', uploadingMediaId) },
    ],
    visibility: 'PUBLIC',
  });

  const error = result.errors?.[0]?.originalError;
  assert.equal(error, outage);
  assert.equal(result.errors?.[0]?.extensions.field, undefined);
  assert.equal(start.mock.callCount(), 0);
});

test('createPost returns a Workflow admission error without querying request state', async (t) => {
  const admissionFailure = new Error('Temporal start acknowledgement was lost');
  const start = t.mock.method(temporalClient.workflow, 'start', async () => {
    throw admissionFailure;
  });
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle');
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await requestSubmit({ bodyText: 'post body', visibility: 'PUBLIC' });

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.originalError, admissionFailure);
  assert.equal(start.mock.callCount(), 1);
  assert.equal(getHandle.mock.callCount(), 0);
});
