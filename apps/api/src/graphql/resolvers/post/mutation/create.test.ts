import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { AccountProfileRole, MediaState } from '@kosmo/core/enums';
import { ConflictError, FieldError, ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { temporalClient } from '@kosmo/core/temporal/client';
import {
  PostRequestStatus,
  postRequestWorkflow,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { ApplicationFailure } from '@temporalio/client';
import { graphql, GraphQLObjectType, GraphQLSchema, isObjectType } from 'graphql';
import { schema } from '@/graphql/schema';
import type { TestContext } from 'node:test';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';

const requestOwnerAccountId = '00000000-0000-4000-8000-000000000011';
const requestProfileId = '00000000-0000-4000-8000-000000000012';

const createPostRequest = (selection: string, media?: readonly { mediaId: string }[]) =>
  graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { ${selection} }
      }
    `,
    variableValues: {
      input: {
        bodyText: 'post body',
        ...(media === undefined ? {} : { media }),
        visibility: 'PUBLIC',
      },
    },
    contextValue: {
      session: {
        accountId: requestOwnerAccountId,
        profile: { id: requestProfileId, role: AccountProfileRole.MEMBER },
      },
    },
  });

const completedRequest = (
  requestId: string,
  status: PostRequestState['status'],
  fields: Pick<PostRequestState, 'error' | 'result'> = {},
): PostRequestState => ({
  snapshot: {
    input: {
      accountId: requestOwnerAccountId,
      bodyText: 'post body',
      contentWarning: null,
      media: [],
      mentions: [],
      origin: 'LOCAL',
      profileId: requestProfileId,
      sensitiveMedia: false,
      visibility: 'PUBLIC',
    },
    requestId,
    submittedAt: '2026-10-29T00:00:00.000Z',
  },
  status,
  ...fields,
});

const setupPostRequestWorkflow = (
  t: TestContext,
  result: (
    snapshot: PostRequestState['snapshot'],
  ) => PostRequestState | Error | Promise<PostRequestState>,
) => {
  let snapshot: PostRequestState['snapshot'] | undefined;
  let workflowId: string | undefined;
  let resultCallCount = 0;
  const start = t.mock.method(
    temporalClient.workflow,
    'start',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postRequestWorkflow.workflow);
      snapshot = (options as { args: readonly [PostRequestState['snapshot']] }).args[0];
      workflowId = postRequestWorkflowId(requestOwnerAccountId, snapshot.requestId);
      assert.equal((options as { workflowId: string }).workflowId, workflowId);
      return { workflowId } as never;
    },
  );
  const getHandle = t.mock.method(
    temporalClient.workflow,
    'getHandle',
    (requestedWorkflowId: string) => {
      assert.equal(requestedWorkflowId, workflowId);
      return {
        result: async () => {
          resultCallCount += 1;
          assert.ok(snapshot);
          const state = result(snapshot);
          if (state instanceof Error) {
            throw state;
          }
          return state;
        },
      } as never;
    },
  );
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  return {
    get resultCallCount() {
      return resultCallCount;
    },
    get snapshot() {
      return snapshot;
    },
    getHandle,
    start,
  };
};

test('PostContent.document projects Hashtag, Mention and Media IDs', async () => {
  const postContent = schema.getType('PostContent');
  assert.ok(isObjectType(postContent));

  const bodyText = 'before @alice #Tag after';
  const hashtagId = '019f6678-86fa-709b-984e-1520766b8447';
  const mediaId = '019f6678-86fa-709b-984e-1520766b8448';
  const profileId = '019f6678-86fa-709b-984e-1520766b8449';
  const mentionStart = bodyText.indexOf('@alice');
  const hashtagStart = bodyText.indexOf('#Tag');
  const document = postContentDocumentFromTextAndMedia(
    bodyText,
    [{ mediaId }],
    true,
    'Content warning',
    [
      {
        end: mentionStart + '@alice'.length,
        handle: '@alice',
        profileId,
        relativeHandle: '@alice',
        start: mentionStart,
      },
    ],
    [{ end: hashtagStart + '#Tag'.length, hashtagId, start: hashtagStart }],
  );
  const executableSchema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'PostContentDocumentQuery',
      fields: {
        content: {
          type: postContent,
          resolve: () => ({ document }),
        },
      },
    }),
  });

  const projected = await graphql({
    schema: executableSchema,
    source: '{ content { document bodyText contentWarning } }',
  });
  assert.deepEqual(projected.errors, undefined);
  const content = projected.data?.content as {
    bodyText: string;
    contentWarning: string;
    document: typeof document;
  };
  assert.equal(content.bodyText, bodyText);
  assert.equal(content.contentWarning, 'Content warning');
  assert.equal(content.document.summary, 'Content warning');
  assert.deepEqual(content.document.body.attrs, { sensitiveMedia: true });
  assert.deepEqual(content.document.body.content[0], {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'before ' },
      {
        attrs: { handle: '@alice', profileId: encodeGlobalId('Profile', profileId) },
        type: 'mention',
      },
      { type: 'text', text: ' ' },
      {
        attrs: { hashtagId: encodeGlobalId('Hashtag', hashtagId), token: '#Tag' },
        type: 'hashtag',
      },
      { type: 'text', text: ' after' },
    ],
  });
  assert.deepEqual(content.document.body.content[1], {
    attrs: { mediaId: encodeGlobalId('Media', mediaId) },
    type: 'media',
  });
});

test('validates createPost input before running the resolver', async () => {
  const mediaId = encodeGlobalId('Media', '00000000-0000-8000-8000-000000000001');
  for (const [input, message, field] of [
    [{ bodyText: ' \n ', visibility: 'UNLISTED' }, '본문 또는 이미지를 추가해주세요.', 'bodyText'],
    [
      { bodyText: '가'.repeat(501), visibility: 'UNLISTED' },
      '본문은 500자까지 작성할 수 있어요.',
      'bodyText',
    ],
    [
      { bodyText: '가'.repeat(500), contentWarning: '😀', visibility: 'UNLISTED' },
      '본문과 내용 경고는 500자까지 작성할 수 있어요.',
      'contentWarning',
    ],
    [
      {
        bodyText: '',
        media: Array.from({ length: 5 }, () => ({ mediaId })),
        visibility: 'UNLISTED',
      },
      '이미지는 4개까지 첨부할 수 있어요.',
      'media',
    ],
  ] as const) {
    const result = await graphql({
      schema,
      source: `
        mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) {
            post { id }
          }
        }
      `,
      variableValues: { input },
      contextValue: {
        session: {
          profile: {
            id: '00000000-0000-8000-8000-000000000001',
            role: AccountProfileRole.MEMBER,
          },
        },
      },
    });

    assert.equal(result.data == null, true);
    assert.equal(result.errors?.[0]?.message, message);
    const error = result.errors?.[0]?.originalError;
    assert.ok(error instanceof ValidationError);
    assert.equal(error.field, field);
  }
});

test('createPost rejects a caller-supplied request ID', async (t) => {
  const start = t.mock.method(temporalClient.workflow, 'start');
  const result = await graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { post { id } request { id } }
      }
    `,
    variableValues: {
      input: { bodyText: 'post body', requestId: crypto.randomUUID(), visibility: 'PUBLIC' },
    },
    contextValue: {
      session: {
        accountId: '00000000-0000-4000-8000-000000000002',
        profile: {
          id: '00000000-0000-4000-8000-000000000001',
          role: AccountProfileRole.MEMBER,
        },
      },
    },
  });

  assert.equal(result.data, undefined);
  assert.match(result.errors?.[0]?.message ?? '', /requestId/);
  assert.equal(start.mock.callCount(), 0);
});

test('createPost rejects the legacy media processing alias', async (t) => {
  const start = t.mock.method(temporalClient.workflow, 'start');
  const result = await graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { post { id } }
      }
    `,
    variableValues: {
      input: {
        bodyText: 'post body',
        media: [
          {
            mediaId: encodeGlobalId('Media', '00000000-0000-4000-8000-000000000003'),
            applyNightshade: true,
          },
        ],
        visibility: 'PUBLIC',
      },
    },
    contextValue: {
      session: {
        accountId: requestOwnerAccountId,
        profile: { id: requestProfileId, role: AccountProfileRole.MEMBER },
      },
    },
  });

  assert.equal(result.data, undefined);
  assert.match(result.errors?.[0]?.message ?? '', /applyNightshade/);
  assert.equal(start.mock.callCount(), 0);
});

test('accepts a combined body and Content Warning of 500 Unicode code points', async (t) => {
  const workflowReached = new Error('postRequestWorkflow reached');
  const accountId = '00000000-0000-4000-8000-000000000002';
  const start = t.mock.method(temporalClient.workflow, 'start', async (workflow: unknown) => {
    assert.equal(workflow, postRequestWorkflow.workflow);
    throw workflowReached;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          post { id }
        }
      }
    `,
    variableValues: {
      input: {
        bodyText: '가'.repeat(499),
        contentWarning: '😀',
        visibility: 'UNLISTED',
      },
    },
    contextValue: {
      session: {
        accountId,
        profile: {
          id: '00000000-0000-8000-8000-000000000001',
          role: AccountProfileRole.MEMBER,
        },
      },
    },
  });

  assert.equal(result.errors?.[0]?.originalError, workflowReached);
  assert.equal(start.mock.callCount(), 1);
});

test('createPost uses Post Request and forwards supported analytics platforms', async (t) => {
  const accountId = '00000000-0000-4000-8000-000000000002';
  const profileId = '00000000-0000-4000-8000-000000000001';
  const states = new Map<string, PostRequestState>();
  const startedSnapshots: PostRequestState['snapshot'][] = [];
  const createdPostIds: string[] = [];
  const postIdsForLookup: string[] = [];
  let resultCallCount = 0;
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    (workflowId: string) =>
      ({
        result: async () => {
          resultCallCount += 1;
          const state = states.get(workflowId);
          assert.ok(state);
          return state;
        },
      }) as never,
  );
  const start = t.mock.method(
    temporalClient.workflow,
    'start',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postRequestWorkflow.workflow);
      const snapshot = (options as { args: readonly [PostRequestState['snapshot']] }).args[0];
      const workflowId = postRequestWorkflowId(accountId, snapshot.requestId);
      assert.match(snapshot.requestId, /^[0-9a-f-]{36}$/i);
      assert.equal((options as { workflowId: string }).workflowId, workflowId);
      startedSnapshots.push(snapshot);
      const postId = crypto.randomUUID();
      createdPostIds.push(postId);
      postIdsForLookup.push(postId);
      states.set(workflowId, {
        snapshot,
        status: PostRequestStatus.PUBLISHED,
        result: { postId },
      });
      return { workflowId } as never;
    },
  );
  t.mock.method(
    db,
    'select',
    () =>
      ({
        from: () => ({
          where: () => ({
            limit: async (limit: number) => {
              assert.equal(limit, 1);
              const postId = postIdsForLookup.shift();
              assert.ok(postId);
              return [{ id: postId, profileId }];
            },
          }),
        }),
      }) as never,
  );
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  for (const { expected, header } of [
    { expected: 'web', header: 'web' },
    { expected: 'native', header: 'native' },
    { expected: undefined, header: 'Web' },
    { expected: undefined, header: undefined },
  ]) {
    const result = await graphql({
      schema,
      source: `
        mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) { post { id } request { id status } }
        }
      `,
      variableValues: { input: { bodyText: 'synchronous post', visibility: 'PUBLIC' } },
      contextValue: {
        session: {
          accountId,
          profile: { id: profileId, role: AccountProfileRole.MEMBER },
        },
        ...(header === undefined
          ? {}
          : {
              c: {
                req: {
                  header: (name: string) =>
                    name === 'x-kosmo-analytics-platform' ? header : undefined,
                },
              },
            }),
      },
    });

    assert.deepEqual(result.errors, undefined);
    const response = result.data?.createPost as {
      post: { id: string };
      request: { id: string; status: string };
    };
    assert.equal(response.post.id, encodeGlobalId('Post', createdPostIds.at(-1)!));
    assert.equal(response.request.status, PostRequestStatus.PUBLISHED);
    assert.equal(startedSnapshots.at(-1)?.analyticsPlatform, expected);
    assert.equal(
      Object.hasOwn(startedSnapshots.at(-1) ?? {}, 'analyticsPlatform'),
      expected !== undefined,
    );
  }

  assert.equal(start.mock.callCount(), 4);
  assert.equal(resultCallCount, 4);
  assert.deepEqual(postIdsForLookup, []);
  assert.equal(createdPostIds.length, 4);
});

test('createPost without media returns the actual published request state', async (t) => {
  const workflow = setupPostRequestWorkflow(t, (snapshot) =>
    completedRequest(snapshot.requestId, PostRequestStatus.PUBLISHED, {
      result: { postId: '00000000-0000-4000-8000-000000000014' },
    }),
  );

  const result = await createPostRequest('request { id status }');

  assert.deepEqual(result.errors, undefined);
  assert.equal(
    (result.data?.createPost as { request: { status: string } }).request.status,
    PostRequestStatus.PUBLISHED,
  );
  assert.equal(workflow.start.mock.callCount(), 1);
  assert.equal(workflow.resultCallCount, 1);
});

test('createPost acknowledges explicitly filtered pending media regardless of Post field selection', async (t) => {
  const postId = '00000000-0000-4000-8000-000000000016';
  const mediaId = '00000000-0000-4000-8000-000000000017';
  const uploadId = '00000000-0000-4000-8000-000000000018';
  let publishRequest!: (state: PostRequestState) => void;
  const deferredResult = new Promise<PostRequestState>((resolve) => {
    publishRequest = resolve;
  });
  const workflow = setupPostRequestWorkflow(t, () => deferredResult);
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
  const select = t.mock.method(
    db,
    'select',
    () =>
      ({
        from: () => ({
          where: async () => [
            {
              id: mediaId,
              state: MediaState.UPLOADING,
              storageReference: `nexus:v1:${uploadId}`,
              url: null,
            },
          ],
        }),
      }) as never,
  );

  const media = [{ applyAiProhibitFilter: true, mediaId: encodeGlobalId('Media', mediaId) }];
  let requestOnlySettled = false;
  const requestOnlyPromise = createPostRequest('request { status }', media).then((result) => {
    requestOnlySettled = true;
    return result;
  });
  let postSelectedSettled = false;
  let postSelectedPromise: ReturnType<typeof createPostRequest> | undefined;
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(requestOnlySettled, true);
    assert.equal(select.mock.callCount(), 1);
    assert.equal(workflow.start.mock.callCount(), 1);

    const requestOnlyResult = await requestOnlyPromise;
    assert.deepEqual(requestOnlyResult.errors, undefined);
    assert.equal(
      (requestOnlyResult.data?.createPost as { request: { status: string } }).request.status,
      PostRequestStatus.QUEUED,
    );

    postSelectedPromise = createPostRequest('post { id } request { status }', media).then(
      (result) => {
        postSelectedSettled = true;
        return result;
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(postSelectedSettled, true);

    const postSelectedResult = await postSelectedPromise;
    assert.deepEqual(postSelectedResult.errors, undefined);
    const response = postSelectedResult.data?.createPost as {
      post: { id: string } | null;
      request: { status: string };
    };
    assert.equal(response.request.status, PostRequestStatus.QUEUED);
    assert.equal(response.post, null);
    assert.equal(select.mock.callCount(), 2);
    assert.equal(workflow.start.mock.callCount(), 2);
    assert.equal(workflow.getHandle.mock.callCount(), 0);
  } finally {
    const snapshot = workflow.snapshot;
    assert.ok(snapshot);
    publishRequest({
      snapshot: {
        ...snapshot,
        input: {
          ...snapshot.input,
          media: [{ altText: null, applyNightshade: false, mediaId }],
        },
      },
      status: PostRequestStatus.PUBLISHED,
      result: { postId },
    });
    await requestOnlyPromise;
    if (postSelectedPromise) {
      await postSelectedPromise;
    }
  }
});

test('createPost maps a failed no-media request without field metadata to its GraphQL error', async (t) => {
  setupPostRequestWorkflow(t, (snapshot) =>
    completedRequest(snapshot.requestId, PostRequestStatus.FAILED, {
      error: { code: 'VALIDATION', message: 'Post content is invalid' },
    }),
  );

  const result = await createPostRequest('post { id }');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.message, 'Post content is invalid');
  assert.ok(result.errors?.[0]?.originalError instanceof FieldError);
  assert.equal((result.errors?.[0]?.originalError as FieldError).code, 'VALIDATION');
  assert.equal((result.errors?.[0]?.originalError as FieldError).field, undefined);
});

test('createPost maps a failed no-media request field to its GraphQL error', async (t) => {
  setupPostRequestWorkflow(t, (snapshot) =>
    completedRequest(snapshot.requestId, PostRequestStatus.FAILED, {
      error: {
        code: 'VALIDATION',
        field: 'replyParentId',
        message: 'Reply Parent must have content',
      },
    }),
  );

  const result = await createPostRequest('post { id }');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.message, 'Reply Parent must have content');
  assert.ok(result.errors?.[0]?.originalError instanceof FieldError);
  assert.equal((result.errors?.[0]?.originalError as FieldError).code, 'VALIDATION');
  assert.equal((result.errors?.[0]?.originalError as FieldError).field, 'replyParentId');
});

test('createPost maps a cancelled no-media request to ConflictError', async (t) => {
  setupPostRequestWorkflow(t, (snapshot) =>
    completedRequest(snapshot.requestId, PostRequestStatus.CANCELLED),
  );

  const result = await createPostRequest('post { id }');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.originalError instanceof ConflictError, true);
});

test('createPost keeps no-media workflow wait failures as GraphQL errors', async (t) => {
  const waitFailure = new Error('post request wait failed');
  setupPostRequestWorkflow(t, () => waitFailure);

  const result = await createPostRequest('post { id }');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.originalError, waitFailure);
});

test('maps Temporal validation failures back to the GraphQL field error', async (t) => {
  const failure = ApplicationFailure.nonRetryable(
    'Media cannot be attached',
    'VALIDATION',
    'media',
  );
  const start = t.mock.method(temporalClient.workflow, 'start', async () => {
    throw failure;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  const result = await graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          post { id }
        }
      }
    `,
    variableValues: { input: { bodyText: 'body', visibility: 'PUBLIC' } },
    contextValue: {
      session: {
        accountId: crypto.randomUUID(),
        profile: {
          id: crypto.randomUUID(),
          role: AccountProfileRole.MEMBER,
        },
      },
    },
  });

  assert.equal(result.errors?.[0]?.message, failure.message);
  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'media');
  assert.equal(start.mock.callCount(), 1);
});

test('rejects impossible Mention counts before querying target Profiles', async (t) => {
  const select = t.mock.method(db, 'select');
  const getHandle = t.mock.method(temporalClient.workflow, 'getHandle', () => {
    throw new Error('Unexpected Temporal getHandle');
  });
  const start = t.mock.method(temporalClient.workflow, 'start', () => {
    throw new Error('Unexpected Temporal workflow start');
  });
  const result = await graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { post { id } }
      }
    `,
    variableValues: {
      input: {
        bodyText: '@x',
        mentions: [
          { end: 2, profileId: encodeGlobalId('Profile', crypto.randomUUID()), start: 0 },
          { end: 2, profileId: encodeGlobalId('Profile', crypto.randomUUID()), start: 0 },
        ],
        visibility: 'UNLISTED',
      },
    },
    contextValue: {
      session: {
        accountId: crypto.randomUUID(),
        profile: {
          id: crypto.randomUUID(),
          role: AccountProfileRole.MEMBER,
        },
      },
    },
  });

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'mentions');
  assert.equal(select.mock.callCount(), 0);
  assert.equal(getHandle.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
});

test('Pothos rejects a non-Profile global ID for a selected Mention before target lookup', async (t) => {
  const select = t.mock.method(db, 'select');
  const wrongTypeId = encodeGlobalId('Post', crypto.randomUUID());
  const result = await graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { post { id } }
      }
    `,
    variableValues: {
      input: {
        bodyText: '@x',
        mentions: [{ end: 2, profileId: wrongTypeId, start: 0 }],
        visibility: 'UNLISTED',
      },
    },
    contextValue: {
      session: {
        profile: {
          id: crypto.randomUUID(),
          role: AccountProfileRole.MEMBER,
        },
      },
    },
  });

  assert.match(result.errors?.[0]?.message ?? '', /is not of type: Profile/);
  assert.equal(select.mock.callCount(), 0);
});
