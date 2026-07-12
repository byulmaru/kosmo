import assert from 'node:assert/strict';
import test from 'node:test';
import { graphql, isInputObjectType, isObjectType } from 'graphql';
import { schema } from './schema';

test('exposes the Plain Text post contract without TipTap', () => {
  const postContent = schema.getType('PostContent');
  const createPostInput = schema.getType('CreatePostInput');

  assert.ok(isObjectType(postContent));
  assert.ok(postContent.getFields().contentWarning);
  assert.equal(postContent.getFields().spoilerText, undefined);
  assert.equal(postContent.getFields().bodyJson, undefined);

  assert.ok(isInputObjectType(createPostInput));
  assert.equal(createPostInput.getFields().content, undefined);
  assert.equal(String(createPostInput.getFields().bodyText?.type), 'String!');
  assert.equal(schema.getType('TipTapDocument'), undefined);
});

test('follow mutation payloads expose both updated profiles', () => {
  const followPayload = schema.getType('FollowProfilePayload');
  const unfollowPayload = schema.getType('UnfollowProfilePayload');

  assert.ok(isObjectType(followPayload));
  assert.ok(followPayload.getFields().followerProfile);
  assert.ok(followPayload.getFields().followeeProfile);
  assert.equal(followPayload.getFields().profile, undefined);

  assert.ok(isObjectType(unfollowPayload));
  assert.ok(unfollowPayload.getFields().followerProfile);
  assert.ok(unfollowPayload.getFields().followeeProfile);
  assert.equal(unfollowPayload.getFields().profile, undefined);
});

test('rejects empty and over-500-character Plain Text before creating a post', async () => {
  for (const [bodyText, message] of [
    [' \n ', '본문을 입력해주세요.'],
    ['가'.repeat(501), '본문은 500자까지 작성할 수 있어요.'],
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
      variableValues: { input: { bodyText, visibility: 'UNLISTED' } },
      contextValue: { session: { profileId: '00000000-0000-8000-8000-000000000001' } },
    });

    assert.equal(result.data == null, true);
    assert.equal(result.errors?.[0]?.message, message);
  }
});
