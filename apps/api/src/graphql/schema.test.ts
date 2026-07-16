import assert from 'node:assert/strict';
import test from 'node:test';
import { graphql, isInputObjectType, isInterfaceType, isObjectType } from 'graphql';
import { encodeGlobalId } from './global-id';
import { notificationNodeType } from './resolvers/notification/ref';
import { schema } from './schema';

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
  assert.equal(schema.getType('TipTapDocument'), undefined);
  assert.equal(schema.getType('PostContentBody'), undefined);
  assert.equal(String(schema.getType('PostContentDocument')), 'PostContentDocument');
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
  assert.equal(String(unfollowPayload.getFields().followerProfile?.type), 'Profile!');
  assert.equal(String(unfollowPayload.getFields().followeeProfile?.type), 'Profile');
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

test('exposes Notification interface and FollowNotification without raw storage fields', () => {
  const notification = schema.getType('Notification');
  const followNotification = schema.getType('FollowNotification');

  assert.ok(isObjectType(followNotification));
  assert.deepEqual(
    followNotification.getInterfaces().map(({ name }) => name),
    ['Node', 'Notification'],
  );
  assert.equal(String(followNotification.getFields().profile.type), 'Profile!');
  assert.equal(followNotification.getFields().relatedProfile, undefined);
  assert.equal(followNotification.getFields().kind, undefined);
  assert.equal(followNotification.getFields().sourceId, undefined);
  assert.equal(followNotification.getFields().data, undefined);
  assert.equal(schema.getType('NotificationType'), undefined);

  assert.ok(isInterfaceType(notification));
  assert.deepEqual(
    notification.getInterfaces().map(({ name }) => name),
    ['Node'],
  );
  assert.equal(notificationNodeType('FOLLOW'), 'FollowNotification');
  assert.equal(notificationNodeType('UNSUPPORTED'), null);
});

test('rejects legacy raw UUID and unknown typename Node IDs', async () => {
  for (const id of [
    '00000000-0000-8006-8000-000000000001',
    encodeGlobalId('Unknown', '00000000-0000-8006-8000-000000000001'),
  ]) {
    const result = await graphql({
      schema,
      source: `query Node($id: ID!) { node(id: $id) { id } }`,
      variableValues: { id },
      contextValue: {},
    });

    assert.equal(result.data?.node, null);
    assert.ok(result.errors?.[0]);
  }
});

test('rejects a global ID with the wrong concrete mutation input type', async () => {
  const result = await graphql({
    schema,
    source: `mutation UpdateProfile($id: ID!) {
      updateProfile(input: { id: $id }) { profile { id } }
    }`,
    variableValues: {
      id: encodeGlobalId('Post', '00000000-0000-8006-8000-000000000001'),
    },
    contextValue: { session: { accountId: 'account', id: 'session' } },
  });

  assert.equal(result.data, null);
  assert.match(result.errors?.[0]?.message ?? '', /is not of type: Profile/);
});
