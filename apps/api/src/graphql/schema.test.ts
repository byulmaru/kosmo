import assert from 'node:assert/strict';
import test from 'node:test';
import { graphql, isInputObjectType, isInterfaceType, isObjectType, isUnionType } from 'graphql';
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
  assert.equal(String(createPostInput.getFields().replyParentId?.type), 'ID');
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

test('exposes the minimal idempotent Reaction add contract', () => {
  const mutation = schema.getMutationType();
  const input = schema.getType('AddReactionInput');
  const payload = schema.getType('AddReactionPayload');
  const reaction = schema.getType('Reaction');

  assert.equal(String(mutation?.getFields().addReaction?.type), 'AddReactionPayload!');
  assert.ok(isInputObjectType(input));
  assert.equal(String(input.getFields().postId.type), 'ID!');
  assert.equal(String(input.getFields().type.type), 'String!');
  assert.ok(isObjectType(payload));
  assert.equal(String(payload.getFields().reaction.type), 'Reaction!');
  assert.equal(payload.getFields().created, undefined);
  assert.ok(isObjectType(reaction));
  assert.deepEqual(
    reaction.getInterfaces().map(({ name }) => name),
    ['Node'],
  );
  assert.equal(String(reaction.getFields().type.type), 'String!');
  assert.equal(String(reaction.getFields().createdAt.type), 'DateTime!');
});

test('exposes the Bookmark mutation and relationship contract', () => {
  const mutation = schema.getMutationType();
  const createInput = schema.getType('CreateBookmarkInput');
  const createPayload = schema.getType('CreateBookmarkPayload');
  const deleteInput = schema.getType('DeleteBookmarkInput');
  const deletePayload = schema.getType('DeleteBookmarkPayload');
  const bookmark = schema.getType('Bookmark');

  assert.equal(String(mutation?.getFields().createBookmark?.type), 'CreateBookmarkPayload!');
  assert.ok(isInputObjectType(createInput));
  assert.equal(String(createInput.getFields().postId.type), 'ID!');
  assert.ok(isObjectType(createPayload));
  assert.equal(String(createPayload.getFields().bookmark.type), 'Bookmark!');
  assert.equal(String(mutation?.getFields().deleteBookmark?.type), 'DeleteBookmarkPayload!');
  assert.ok(isInputObjectType(deleteInput));
  assert.equal(String(deleteInput.getFields().id.type), 'ID!');
  assert.ok(isObjectType(deletePayload));
  assert.equal(String(deletePayload.getFields().bookmarkId.type), 'ID');
  assert.equal(String(deletePayload.getFields().post.type), 'Post');
  assert.ok(isObjectType(bookmark));
  assert.equal(String(bookmark.getFields().profile.type), 'Profile!');
  assert.equal(String(bookmark.getFields().post.type), 'Post');
  assert.equal(String(bookmark.getFields().createdAt.type), 'DateTime!');
});

test('exposes the ID-based idempotent Reaction delete contract', () => {
  const mutation = schema.getMutationType();
  const input = schema.getType('DeleteReactionInput');
  const payload = schema.getType('DeleteReactionPayload');

  assert.equal(String(mutation?.getFields().deleteReaction?.type), 'DeleteReactionPayload!');
  assert.ok(isInputObjectType(input));
  assert.equal(String(input.getFields().id.type), 'ID!');
  assert.ok(isObjectType(payload));
  assert.equal(String(payload.getFields().reactionId.type), 'ID!');
  assert.equal(payload.getFields().reaction, undefined);
  assert.equal(payload.getFields().deleted, undefined);
});

test('exposes Reaction Profiles as the shared Profile connection without Reaction metadata', () => {
  const post = schema.getType('Post');
  const connection = schema.getType('ProfileConnection');
  const edge = schema.getType('ProfileConnectionEdge');

  assert.ok(isObjectType(post));
  const field = post.getFields().reactionProfiles;
  assert.equal(String(field?.type), 'ProfileConnection!');
  assert.equal(String(field?.args.find(({ name }) => name === 'type')?.type), 'String!');

  assert.ok(isObjectType(connection));
  assert.ok(isObjectType(edge));
  assert.equal(String(edge.getFields().node.type), 'Profile!');
  assert.equal(edge.getFields().reaction, undefined);
  assert.equal(edge.getFields().reactionId, undefined);
  assert.equal(edge.getFields().reactedAt, undefined);
});

test('exposes the profile follow request lifecycle contract', () => {
  const profile = schema.getType('Profile');
  const viewerState = schema.getType('ProfileViewerState');
  const request = schema.getType('ProfileFollowRequest');
  const result = schema.getType('ProfileFollowResult');
  const followPayload = schema.getType('FollowProfilePayload');
  const approvePayload = schema.getType('ApproveProfileFollowRequestPayload');
  const rejectPayload = schema.getType('RejectProfileFollowRequestPayload');
  const cancelPayload = schema.getType('CancelProfileFollowRequestPayload');

  assert.ok(isObjectType(profile));
  assert.equal(profile.getFields().viewerFollowRequest, undefined);
  assert.equal(profile.getFields().viewerFollow, undefined);
  assert.equal(
    String(profile.getFields().incomingProfileFollowRequests?.type),
    'ProfileIncomingProfileFollowRequestsConnection',
  );
  assert.equal(
    String(profile.getFields().outgoingProfileFollowRequests?.type),
    'ProfileOutgoingProfileFollowRequestsConnection',
  );

  assert.ok(isObjectType(request));
  assert.equal(String(request.getFields().follower?.type), 'Profile');
  assert.equal(String(request.getFields().followee?.type), 'Profile');

  assert.ok(isObjectType(viewerState));
  assert.equal(String(viewerState.getFields().follow?.type), 'ProfileFollow');
  assert.equal(String(viewerState.getFields().followRequest?.type), 'ProfileFollowRequest');

  assert.ok(isUnionType(result));
  assert.deepEqual(
    result
      .getTypes()
      .map(({ name }) => name)
      .sort(),
    ['ProfileFollow', 'ProfileFollowRequest'],
  );

  assert.ok(isObjectType(followPayload));
  assert.equal(String(followPayload.getFields().result?.type), 'ProfileFollowResult!');
  assert.equal(followPayload.getFields().profileFollow, undefined);

  assert.ok(isObjectType(approvePayload));
  assert.equal(String(approvePayload.getFields().profileFollow?.type), 'ProfileFollow!');
  assert.equal(String(approvePayload.getFields().profileFollowRequestId?.type), 'ID!');
  assert.equal(String(approvePayload.getFields().followerProfile?.type), 'Profile!');
  assert.equal(String(approvePayload.getFields().followeeProfile?.type), 'Profile!');

  assert.ok(isObjectType(rejectPayload));
  assert.equal(String(rejectPayload.getFields().profileFollowRequestId?.type), 'ID!');
  assert.equal(String(rejectPayload.getFields().followeeProfile?.type), 'Profile!');
  assert.equal(rejectPayload.getFields().followerProfile, undefined);
  assert.equal(rejectPayload.getFields().profileFollowRequest, undefined);

  assert.ok(isObjectType(cancelPayload));
  assert.equal(String(cancelPayload.getFields().profileFollowRequestId?.type), 'ID!');
  assert.equal(String(cancelPayload.getFields().followerProfile?.type), 'Profile!');
  assert.equal(cancelPayload.getFields().followeeProfile, undefined);
  assert.equal(cancelPayload.getFields().profileFollowRequest, undefined);
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
  const profile = schema.getType('Profile');

  assert.ok(isObjectType(followNotification));
  assert.ok(isObjectType(profile));
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
  assert.equal(String(profile.getFields().notifications?.type), 'NotificationConnection!');
  assert.equal(String(profile.getFields().unreadNotificationCount?.type), 'Int!');

  const connection = schema.getType('NotificationConnection');
  const edge = schema.getType('NotificationConnectionEdge');
  assert.ok(isObjectType(connection));
  assert.ok(isObjectType(edge));
  assert.equal(String(connection.getFields().pageInfo.type), 'PageInfo!');
  assert.equal(String(edge.getFields().cursor.type), 'String!');
  assert.equal(String(edge.getFields().node.type), 'Notification!');
});

test('exposes the typed Notification Read mutation payload', () => {
  const mutation = schema.getMutationType();
  const input = schema.getType('MarkNotificationReadInput');
  const payload = schema.getType('MarkNotificationReadPayload');

  assert.equal(
    String(mutation?.getFields().markNotificationRead?.type),
    'MarkNotificationReadPayload!',
  );
  assert.ok(isInputObjectType(input));
  assert.equal(String(input.getFields().id.type), 'ID!');
  assert.ok(isObjectType(payload));
  assert.equal(String(payload.getFields().notification.type), 'Notification!');
  assert.equal(String(payload.getFields().recipientProfile.type), 'Profile!');
});

test('exposes the private Bookmark Node and Profile connection contract', () => {
  const bookmark = schema.getType('Bookmark');
  const profile = schema.getType('Profile');
  const connection = schema.getType('BookmarkConnection');
  const edge = schema.getType('BookmarkConnectionEdge');

  assert.ok(isObjectType(bookmark));
  assert.ok(isObjectType(profile));
  assert.deepEqual(
    bookmark.getInterfaces().map(({ name }) => name),
    ['Node'],
  );
  assert.equal(String(bookmark.getFields().createdAt.type), 'DateTime!');
  assert.equal(String(bookmark.getFields().post.type), 'Post');
  assert.equal(String(bookmark.getFields().profile.type), 'Profile!');
  assert.equal(bookmark.getFields().postId, undefined);
  assert.equal(String(profile.getFields().bookmarks?.type), 'BookmarkConnection!');

  assert.ok(isObjectType(connection));
  assert.ok(isObjectType(edge));
  assert.equal(String(connection.getFields().pageInfo.type), 'PageInfo!');
  assert.equal(String(edge.getFields().cursor.type), 'String!');
  assert.equal(String(edge.getFields().node.type), 'Bookmark!');
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

test('rejects a non-FollowNotification global ID for Notification Read', async () => {
  const result = await graphql({
    schema,
    source: `mutation MarkNotificationRead($id: ID!) {
      markNotificationRead(input: { id: $id }) { notification { id } }
    }`,
    variableValues: {
      id: encodeGlobalId('Profile', '00000000-0000-8006-8000-000000000001'),
    },
    contextValue: { session: { accountId: 'account', id: 'session' } },
  });

  assert.equal(result.data, null);
  assert.match(result.errors?.[0]?.message ?? '', /is not of type: FollowNotification/);
});
