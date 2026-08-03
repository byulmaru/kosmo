import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '@kosmo/core/error';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { graphql, isInputObjectType, isObjectType } from 'graphql';
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
      contextValue: { session: { profileId: '00000000-0000-8000-8000-000000000001' } },
    });

    assert.equal(result.data == null, true);
    assert.equal(result.errors?.[0]?.message, message);
    const error = result.errors?.[0]?.originalError;
    assert.ok(error instanceof ValidationError);
    assert.equal(error.field, field);
  }
});
