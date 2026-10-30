import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { ConflictError, KosmoError, ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { temporalClient } from '@kosmo/core/temporal/client';
import { postCreateWorkflow } from '@kosmo/core/temporal/post-create';
import {
  PostRequestStatus,
  postRequestWorkflow,
  postRequestWorkflowId,
} from '@kosmo/core/temporal/post-request';
import { ApplicationFailure } from '@temporalio/client';
import {
  graphql,
  GraphQLObjectType,
  GraphQLSchema,
  isInputObjectType,
  isObjectType,
} from 'graphql';
import { schema } from '@/graphql/schema';
import type { TestContext } from 'node:test';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';

const requestOwnerAccountId = '00000000-0000-4000-8000-000000000011';
const requestProfileId = '00000000-0000-4000-8000-000000000012';

const createPostRequest = (requestId: string, selection: string) =>
  graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { ${selection} }
      }
    `,
    variableValues: {
      input: { bodyText: 'post body', requestId, visibility: 'PUBLIC' },
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
  requestId: string,
  result: PostRequestState | Error | Promise<PostRequestState>,
) => {
  const workflowId = postRequestWorkflowId(requestOwnerAccountId, requestId);
  let resultCallCount = 0;
  const start = t.mock.method(
    temporalClient.workflow,
    'start',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postRequestWorkflow.workflow);
      assert.equal((options as { workflowId: string }).workflowId, workflowId);
      return { workflowId } as never;
    },
  );
  t.mock.method(temporalClient.workflow, 'getHandle', (requestedWorkflowId: string) => {
    assert.equal(requestedWorkflowId, workflowId);
    return {
      query: async () => null,
      result: async () => {
        resultCallCount += 1;
        if (result instanceof Error) {
          throw result;
        }
        return result;
      },
    } as never;
  });
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  return {
    get resultCallCount() {
      return resultCallCount;
    },
    start,
  };
};

test('exposes the versioned PostContent document and Plain Text composer contract', () => {
  const postContent = schema.getType('PostContent');
  const createPostInput = schema.getType('CreatePostInput');

  assert.ok(isObjectType(postContent));
  assert.ok(postContent.getFields().document);
  assert.ok(postContent.getFields().bodyText);
  assert.ok(postContent.getFields().contentWarning);
  assert.equal(postContent.getFields().spoilerText, undefined);
  assert.equal(postContent.getFields().bodyJson, undefined);

  assert.ok(isInputObjectType(createPostInput));
  assert.equal(createPostInput.getFields().content, undefined);
  assert.equal(String(createPostInput.getFields().bodyText?.type), 'String!');
  assert.equal(String(createPostInput.getFields().requestId?.type), 'String');
  assert.equal(String(createPostInput.getFields().media?.type), '[CreatePostMediaInput!]');
  assert.equal(String(createPostInput.getFields().replyParentId?.type), 'ID');
  assert.equal(String(createPostInput.getFields().repostSourceId?.type), 'ID');
  assert.equal(String(createPostInput.getFields().sensitiveMedia?.type), 'Boolean');

  const createPostMediaInput = schema.getType('CreatePostMediaInput');
  assert.ok(isInputObjectType(createPostMediaInput));
  assert.equal(String(createPostMediaInput.getFields().mediaId?.type), 'ID!');
  assert.equal(String(createPostMediaInput.getFields().altText?.type), 'String');
  assert.equal(String(createPostMediaInput.getFields().applyNightshade?.type), 'Boolean');
  assert.equal(createPostMediaInput.getFields().applyNightshade?.defaultValue, false);
  assert.equal(schema.getType('TipTapDocument'), undefined);
  assert.equal(schema.getType('PostContentBody'), undefined);
  assert.equal(String(schema.getType('PostContentDocument')), 'PostContentDocument');

  const createPostPayload = schema.getType('CreatePostPayload');
  assert.ok(isObjectType(createPostPayload));
  assert.equal(String(createPostPayload.getFields().post.type), 'Post!');
  assert.equal(String(createPostPayload.getFields().request.type), 'PostRequest');
  assert.deepEqual(Object.keys(createPostPayload.getFields()).sort(), ['post', 'request']);

  assert.equal(schema.getType('SubmitPostRequestInput'), undefined);
  assert.equal(schema.getType('SubmitPostRequestPayload'), undefined);
  assert.equal(schema.getType('PostRequestMediaInput'), undefined);
  assert.equal(schema.getType('PostRequestDraft'), undefined);
  assert.equal(schema.getType('PostRequestConnection'), undefined);
  assert.equal(schema.getType('CreatePostMedia'), undefined);
  assert.equal(schema.getType('CreatePostMention'), undefined);
  const postRequest = schema.getType('PostRequest');
  assert.ok(isObjectType(postRequest));
  assert.ok(postRequest.getFields().bodyText);
  assert.ok(postRequest.getFields().media);
  assert.equal(postRequest.getFields().mentions, undefined);
  assert.equal(postRequest.getFields().draft, undefined);

  const query = schema.getQueryType();
  assert.ok(query);
  assert.ok(query.getFields().postRequest);
  assert.ok(query.getFields().postRequests);
  assert.equal(query.getFields().account, undefined);
});

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

test('createPost validates an optional request ID as a UUID before resolving', async (t) => {
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const result = await graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { post { id } request { id } }
      }
    `,
    variableValues: {
      input: { bodyText: 'post body', requestId: 'not-a-uuid', visibility: 'PUBLIC' },
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

  const error = result.errors?.[0]?.originalError;
  assert.ok(error instanceof ValidationError);
  assert.equal(error.field, 'requestId');
  assert.equal(execute.mock.callCount(), 0);
});

test('accepts a combined body and Content Warning of 500 Unicode code points', async (t) => {
  const workflowReached = new Error('postCreateWorkflow reached');
  const execute = t.mock.method(
    temporalClient.workflow,
    'execute',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postCreateWorkflow.workflow);
      assert.ok(options && typeof options === 'object');
      const workflowOptions = options as {
        args?: readonly { requestId: string; input: { origin: string } }[];
        workflowId?: string;
        workflowIdConflictPolicy?: string;
        workflowIdReusePolicy?: string;
      };
      const args = workflowOptions.args?.[0];
      assert.ok(args);
      assert.equal(workflowOptions.args?.length, 1);
      assert.equal(args.input.origin, 'LOCAL');
      assert.equal(workflowOptions.workflowId, 'post-create:' + args.requestId);
      assert.equal(workflowOptions.workflowIdConflictPolicy, 'USE_EXISTING');
      assert.equal(workflowOptions.workflowIdReusePolicy, 'REJECT_DUPLICATE');
      assert.equal('returnExistingResult' in workflowOptions, false);
      throw workflowReached;
    },
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
        profile: {
          id: '00000000-0000-8000-8000-000000000001',
          role: AccountProfileRole.MEMBER,
        },
      },
    },
  });

  assert.equal(result.errors?.[0]?.originalError, workflowReached);
  assert.equal(execute.mock.callCount(), 1);
});

test('createPost without a request ID returns the committed Post from the synchronous workflow', async (t) => {
  const postId = '00000000-0000-4000-8000-000000000020';
  const profileId = '00000000-0000-4000-8000-000000000001';
  const execute = t.mock.method(
    temporalClient.workflow,
    'execute',
    async (workflow: unknown, options: unknown) => {
      assert.equal(workflow, postCreateWorkflow.workflow);
      const args = (
        options as { args: readonly [{ requestId: string; input: { origin: string } }] }
      ).args;
      assert.equal(args.length, 1);
      assert.equal(args[0]?.input.origin, 'LOCAL');
      assert.ok(args[0]?.requestId);
      return { authorProfileId: profileId, postId, status: 'created' } as never;
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
              return [{ id: postId, profileId }];
            },
          }),
        }),
      }) as never,
  );

  const result = await graphql({
    schema,
    source: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { post { id } request { id } }
      }
    `,
    variableValues: { input: { bodyText: 'synchronous post', visibility: 'PUBLIC' } },
    contextValue: {
      session: {
        accountId: '00000000-0000-4000-8000-000000000002',
        profile: { id: profileId, role: AccountProfileRole.MEMBER },
      },
    },
  });

  assert.deepEqual(result.errors, undefined);
  const createPost = result.data?.createPost as {
    post: { id: string };
    request: { id: string } | null;
  };
  assert.equal(createPost.post?.id, encodeGlobalId('Post', postId));
  assert.equal(createPost.request, null);
  assert.equal(execute.mock.callCount(), 1);
});

test('createPost request-only selection acknowledges without waiting for workflow result', async (t) => {
  const requestId = '00000000-0000-4000-8000-000000000013';
  const workflow = setupPostRequestWorkflow(
    t,
    requestId,
    completedRequest(requestId, PostRequestStatus.PUBLISHED, {
      result: { postId: '00000000-0000-4000-8000-000000000014' },
    }),
  );

  const result = await createPostRequest(requestId, 'request { id status }');

  assert.deepEqual(result.errors, undefined);
  assert.equal(
    (result.data?.createPost as { request: { status: string } }).request.status,
    'QUEUED',
  );
  assert.equal(workflow.start.mock.callCount(), 1);
  assert.equal(workflow.resultCallCount, 0);
});

test('createPost waits for publication only when selected and returns the published Post row', async (t) => {
  const requestId = '00000000-0000-4000-8000-000000000015';
  const postId = '00000000-0000-4000-8000-000000000016';
  const published = completedRequest(requestId, PostRequestStatus.PUBLISHED, {
    result: { postId },
  });
  let publishRequest!: (state: PostRequestState) => void;
  const deferredResult = new Promise<PostRequestState>((resolve) => {
    publishRequest = resolve;
  });
  const workflow = setupPostRequestWorkflow(t, requestId, deferredResult);
  const select = t.mock.method(
    db,
    'select',
    () =>
      ({
        from: () => ({
          where: () => ({
            limit: async (limit: number) => {
              assert.equal(limit, 1);
              return [{ id: postId, profileId: requestProfileId }];
            },
          }),
        }),
      }) as never,
  );

  let settled = false;
  const resultPromise = createPostRequest(requestId, 'post { id } request { status }').then(
    (result) => {
      settled = true;
      return result;
    },
  );
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(select.mock.callCount(), 0);
    assert.equal(workflow.start.mock.callCount(), 1);
  } finally {
    publishRequest(published);
    await resultPromise;
  }
  const result = await resultPromise;

  assert.deepEqual(result.errors, undefined);
  assert.equal(
    (result.data?.createPost as { post: { id: string } }).post.id,
    encodeGlobalId('Post', postId),
  );
  assert.equal(workflow.start.mock.callCount(), 1);
  assert.equal(select.mock.callCount(), 1);
});

test('createPost maps a failed request error and non-null post selection bubbles the error', async (t) => {
  const requestId = '00000000-0000-4000-8000-000000000017';
  setupPostRequestWorkflow(
    t,
    requestId,
    completedRequest(requestId, PostRequestStatus.FAILED, {
      error: { code: 'VALIDATION', message: 'Post content is invalid' },
    }),
  );

  const result = await createPostRequest(requestId, 'post { id }');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.message, 'Post content is invalid');
  assert.ok(result.errors?.[0]?.originalError instanceof KosmoError);
  assert.equal((result.errors?.[0]?.originalError as KosmoError).code, 'VALIDATION');
});

test('createPost maps a cancelled request to ConflictError and non-null post selection bubbles', async (t) => {
  const requestId = '00000000-0000-4000-8000-000000000018';
  setupPostRequestWorkflow(t, requestId, completedRequest(requestId, PostRequestStatus.CANCELLED));

  const result = await createPostRequest(requestId, 'post { id }');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.originalError instanceof ConflictError, true);
});

test('createPost keeps workflow wait failures as failures when post is selected', async (t) => {
  const requestId = '00000000-0000-4000-8000-000000000019';
  const waitFailure = new Error('post request wait failed');
  setupPostRequestWorkflow(t, requestId, waitFailure);

  const result = await createPostRequest(requestId, 'post { id }');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.originalError, waitFailure);
});

test('maps Temporal validation failures back to the GraphQL field error', async (t) => {
  const failure = ApplicationFailure.nonRetryable(
    'Media cannot be attached',
    'VALIDATION',
    'media',
  );
  const execute = t.mock.method(temporalClient.workflow, 'execute', async () => {
    throw failure;
  });

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
  assert.equal(execute.mock.callCount(), 1);
});

test('rejects impossible Mention counts before querying target Profiles', async (t) => {
  const select = t.mock.method(db, 'select');
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
