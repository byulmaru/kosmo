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

test('exposes pending-only follow request query and mutation contracts', () => {
  const profileFollowRequest = schema.getType('ProfileFollowRequest');
  const profileViewerState = schema.getType('ProfileViewerState');
  const mutation = schema.getMutationType();
  const query = schema.getQueryType();

  assert.ok(isObjectType(profileFollowRequest));
  assert.equal(profileFollowRequest.getFields().state, undefined);
  assert.equal(profileFollowRequest.getFields().respondedAt, undefined);
  assert.ok(isObjectType(profileViewerState));
  assert.ok(profileViewerState.getFields().followRequest);
  assert.ok(query?.getFields().incomingFollowRequests);
  assert.ok(query?.getFields().outgoingFollowRequests);
  assert.ok(mutation?.getFields().approveFollowRequest);
  assert.ok(mutation?.getFields().rejectFollowRequest);
  assert.ok(mutation?.getFields().cancelFollowRequest);
});
