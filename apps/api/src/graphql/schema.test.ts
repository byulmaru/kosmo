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

test('exposes pending-only follow request profile fields and mutation contracts', async () => {
  const profileFollowRequest = schema.getType('ProfileFollowRequest');
  const profileViewerState = schema.getType('ProfileViewerState');
  const profile = schema.getType('Profile');
  const mutation = schema.getMutationType();
  const query = schema.getQueryType();

  assert.ok(isObjectType(profileFollowRequest));
  assert.equal(profileFollowRequest.getFields().state, undefined);
  assert.equal(profileFollowRequest.getFields().respondedAt, undefined);
  assert.ok(isObjectType(profileViewerState));
  assert.ok(profileViewerState.getFields().followRequest);
  assert.ok(isObjectType(profile));
  assert.ok(profile.getFields().incomingFollowRequests);
  assert.ok(profile.getFields().outgoingFollowRequests);
  assert.equal(query?.getFields().incomingFollowRequests, undefined);
  assert.equal(query?.getFields().outgoingFollowRequests, undefined);
  assert.equal(
    await profile
      .getFields()
      .incomingFollowRequests?.resolve?.(
        { id: 'another-profile' } as never,
        {},
        { session: { profileId: 'viewer-profile' } } as never,
        {} as never,
      ),
    null,
  );
  assert.equal(
    await profile
      .getFields()
      .outgoingFollowRequests?.resolve?.(
        { id: 'another-profile' } as never,
        {},
        { session: { profileId: 'viewer-profile' } } as never,
        {} as never,
      ),
    null,
  );
  assert.ok(mutation?.getFields().approveFollowRequest);
  assert.ok(mutation?.getFields().rejectFollowRequest);
  assert.ok(mutation?.getFields().cancelFollowRequest);
});
