import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import {
  graphql,
  GraphQLObjectType,
  GraphQLSchema,
  isInputObjectType,
  isObjectType,
} from 'graphql';
import { schema } from '@/graphql/schema';

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
  assert.equal(String(createPostInput.getFields().media?.type), '[CreatePostMediaInput!]');
  assert.equal(String(createPostInput.getFields().replyParentId?.type), 'ID');
  assert.equal(String(createPostInput.getFields().repostSourceId?.type), 'ID');
  assert.equal(String(createPostInput.getFields().sensitiveMedia?.type), 'Boolean');

  const createPostMediaInput = schema.getType('CreatePostMediaInput');
  assert.ok(isInputObjectType(createPostMediaInput));
  assert.equal(String(createPostMediaInput.getFields().mediaId?.type), 'ID!');
  assert.equal(String(createPostMediaInput.getFields().altText?.type), 'String');
  assert.equal(schema.getType('TipTapDocument'), undefined);
  assert.equal(schema.getType('PostContentBody'), undefined);
  assert.equal(String(schema.getType('PostContentDocument')), 'PostContentDocument');

  const createPostPayload = schema.getType('CreatePostPayload');
  assert.ok(isObjectType(createPostPayload));
  assert.equal(String(createPostPayload.getFields().post.type), 'Post!');
  assert.deepEqual(Object.keys(createPostPayload.getFields()), ['post']);
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
      { bodyText: '가'.repeat(499), contentWarning: '경고', visibility: 'UNLISTED' },
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
