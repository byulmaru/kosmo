import assert from 'node:assert/strict';
import test from 'node:test';
import { db, Posts } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { temporalClient } from '@kosmo/core/temporal/client';
import { postCreateWorkflow } from '@kosmo/core/temporal/post-create';
import { ApplicationFailure } from '@temporalio/client';
import { PgDialect } from 'drizzle-orm/pg-core';
import { graphql, GraphQLObjectType, GraphQLSchema, isObjectType } from 'graphql';
import { schema } from '@/graphql/schema';
import type { TestContext } from 'node:test';
import type {
  PostCreateWorkflowArgs,
  PostCreateWorkflowResult,
} from '@kosmo/core/temporal/post-create';
import type { SQL } from 'drizzle-orm';

const requestOwnerAccountId = '00000000-0000-4000-8000-000000000011';
const requestProfileId = '00000000-0000-4000-8000-000000000012';

const mockTemporalDeadline = (t: TestContext) =>
  t.mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

const setupPostCreateWorkflow = (
  t: TestContext,
  result: PostCreateWorkflowResult,
  onArgs: (args: PostCreateWorkflowArgs) => void = () => {},
) =>
  t.mock.method(temporalClient.workflow, 'execute', async (workflow: unknown, options: unknown) => {
    assert.equal(workflow, postCreateWorkflow.workflow);
    const args = (options as { args: readonly [PostCreateWorkflowArgs] }).args[0];
    onArgs(args);
    return result as never;
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

test('validates createPost input before running the resolver', async (t) => {
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const start = t.mock.method(temporalClient.workflow, 'start');
  const publish = t.mock.method(temporalClient.workflow, 'executeUpdateWithStart');
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
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(publish.mock.callCount(), 0);
});

test('createPost rejects a caller-supplied request ID', async (t) => {
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const start = t.mock.method(temporalClient.workflow, 'start');
  const publish = t.mock.method(temporalClient.workflow, 'executeUpdateWithStart');
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
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(publish.mock.callCount(), 0);
});

test('createPost rejects the legacy media processing alias', async (t) => {
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const start = t.mock.method(temporalClient.workflow, 'start');
  const publish = t.mock.method(temporalClient.workflow, 'executeUpdateWithStart');
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
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(publish.mock.callCount(), 0);
});

test('accepts a combined body and Content Warning of 500 Unicode code points', async (t) => {
  const workflowReached = new Error('postCreateWorkflow reached');
  const accountId = '00000000-0000-4000-8000-000000000002';
  const execute = t.mock.method(temporalClient.workflow, 'execute', async (workflow: unknown) => {
    assert.equal(workflow, postCreateWorkflow.workflow);
    throw workflowReached;
  });
  mockTemporalDeadline(t);

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
  assert.equal(execute.mock.callCount(), 1);
});

test('createPost runs PostCreate regardless of field selection and omits analytics platform', async (t) => {
  const accountId = requestOwnerAccountId;
  const profileId = requestProfileId;
  const postId = '00000000-0000-4000-8000-000000000014';
  const workflowArgs: PostCreateWorkflowArgs[] = [];
  const postLookups: SQL[] = [];
  const execute = setupPostCreateWorkflow(
    t,
    { authorProfileId: profileId, postId, status: 'created' },
    (args) => workflowArgs.push(args),
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
            where: (condition: SQL) => {
              postLookups.push(condition);
              return {
                limit: async (limit: number) => {
                  assert.equal(limit, 1);
                  return [{ id: postId, profileId }];
                },
              };
            },
          };
        },
      }) as never,
  );
  mockTemporalDeadline(t);

  for (const { header, selection } of [
    { header: 'web', selection: 'post { id } request { status }' },
    { header: 'native', selection: 'request { status }' },
    { header: 'Web', selection: 'post { id } request { status }' },
    { header: undefined, selection: 'post { id } request { status }' },
  ]) {
    const result = await graphql({
      schema,
      source: `
        mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) { ${selection} }
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
      post?: { id: string } | null;
      request?: { status: string } | null;
    };
    assert.equal(response.request, null);
    if (selection.startsWith('post')) {
      assert.equal(response.post?.id, encodeGlobalId('Post', postId));
    } else {
      assert.equal(Object.hasOwn(response, 'post'), false);
    }
    const args = workflowArgs.at(-1);
    assert.ok(args);
    assert.equal(args.revalidateAuthorization, true);
    assert.equal(args.input.profileId, profileId);
    assert.match(args.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(args.analyticsPlatform, undefined);
    assert.equal(Object.hasOwn(args, 'analyticsPlatform'), false);
  }

  assert.equal(execute.mock.callCount(), 4);
  assert.equal(workflowArgs.length, 4);
  assert.equal(start.mock.callCount(), 0);
  assert.equal(getHandle.mock.callCount(), 0);
  assert.equal(postLookups.length, 3);
  assert.deepEqual(
    postLookups.map((condition) => new PgDialect().sqlToQuery(condition).params),
    Array.from({ length: 3 }, () => [postId, profileId]),
  );
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
  mockTemporalDeadline(t);

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
  const execute = t.mock.method(temporalClient.workflow, 'execute');
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
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(getHandle.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
});

test('Pothos rejects a non-Profile global ID for a selected Mention before target lookup', async (t) => {
  const select = t.mock.method(db, 'select');
  const execute = t.mock.method(temporalClient.workflow, 'execute');
  const start = t.mock.method(temporalClient.workflow, 'start');
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
  assert.equal(execute.mock.callCount(), 0);
  assert.equal(start.mock.callCount(), 0);
});
