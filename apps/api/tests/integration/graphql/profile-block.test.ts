import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { decodeGlobalId, encodeGlobalId as globalId } from '@kosmo/core/global-id';
import {
  postContentDocumentFromText,
  postContentDocumentFromTextAndMedia,
} from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const localDomain = '127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let Bookmarks: typeof CoreDb.Bookmarks;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;

type GraphQLErrorResult = {
  extensions?: { code?: string };
  message: string;
};

type GraphQLResult<TData = Record<string, unknown>> = {
  data?: TData | null;
  errors?: GraphQLErrorResult[];
};

type ProfileRow = typeof Profiles.$inferSelect;

describe('GraphQL Profile Block', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      Bookmarks,
      db,
      firstOrThrow,
      Instances,
      Media,
      Notifications,
      pg,
      PostContents,
      Posts,
      ProfileBlocks,
      ProfileFollowRequests,
      ProfileFollows,
      Profiles,
      Reactions,
      Sessions,
    } = await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../../src/context'));
    ({ yoga } = await import('../../../src/graphql'));

    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('context', await deriveContext(c));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => resetFixtures());

  after(async () => {
    await pg.end();
  });

  test('selected Local owner receives a domain error for a missing target', async () => {
    const owner = await createAuthenticatedSession();

    const result = await blockProfile(crypto.randomUUID(), owner.token);

    assertGraphQLErrorCode(result, 'NOT_FOUND');
  });

  test('selected Local owner can block Local and Remote targets and manage exact IDs', async () => {
    const owner = await createAuthenticatedSession();
    const localTarget = await createProfile('blocked-local');
    const remoteInstance = await createRemoteInstance();
    const remoteTarget = await createProfile('blocked-remote', remoteInstance.id);
    const thirdParty = await createAuthenticatedSession();

    const localBlock = await blockProfile(localTarget.id, owner.token);
    assertNoGraphQLErrors(localBlock);
    const localBlockId = localBlock.data?.blockProfile.profileBlock.id;
    assert.ok(localBlockId);
    assert.deepEqual(localBlock.data?.blockProfile.profileBlock.targetProfile, {
      id: globalId('ProfileBlockTarget', localTarget.id),
      handle: localTarget.handle,
      displayName: localTarget.displayName,
      domain: localDomain,
      instanceKind: 'LOCAL',
    });
    assert.deepEqual(
      decodeGlobalId(localBlock.data?.blockProfile.profileBlock.targetProfile.id ?? ''),
      { id: localTarget.id, typename: 'ProfileBlockTarget' },
    );

    const repeated = await blockProfile(localTarget.id, owner.token);
    assertNoGraphQLErrors(repeated);
    assert.equal(repeated.data?.blockProfile.profileBlock.id, localBlockId);

    const remoteBlock = await blockProfile(remoteTarget.id, owner.token);
    assertNoGraphQLErrors(remoteBlock);
    const remoteBlockId = remoteBlock.data?.blockProfile.profileBlock.id;
    assert.ok(remoteBlockId);
    assert.equal(
      remoteBlock.data?.blockProfile.profileBlock.targetProfile.instanceKind,
      'ACTIVITYPUB',
    );

    const ownerViews = await requestGraphQL<{
      node: { id: string } | null;
      profileByHandle: { id: string } | null;
      searchProfiles: { edges: Array<{ node: { id: string } }> };
    }>(
      `query OwnerViews($id: ID!, $handle: String!, $query: String!) {
        node(id: $id) { ... on Profile { id } }
        profileByHandle(handle: $handle) { id }
        searchProfiles(query: $query, first: 10) { edges { node { id } } }
      }`,
      {
        id: globalId('Profile', localTarget.id),
        handle: localTarget.handle,
        query: localTarget.handle,
      },
      owner.token,
    );
    assertNoGraphQLErrors(ownerViews);
    assert.deepEqual(ownerViews.data, {
      node: null,
      profileByHandle: null,
      searchProfiles: { edges: [] },
    });

    const thirdPartyView = await requestGraphQL<{ node: { id: string } | null }>(
      `query ThirdPartyProfile($id: ID!) {
        node(id: $id) { ... on Profile { id } }
      }`,
      { id: globalId('Profile', localTarget.id) },
      thirdParty.token,
    );
    assertNoGraphQLErrors(thirdPartyView);
    assert.deepEqual(thirdPartyView.data?.node, {
      id: globalId('Profile', localTarget.id),
    });

    const managed = await requestGraphQL<{
      node: {
        profileBlocks: {
          edges: Array<{
            node: {
              id: string;
              targetProfile: {
                id: string;
                handle: string;
                displayName: string;
                domain: string;
                instanceKind: string;
              };
            };
          }>;
        };
      } | null;
    }>(
      `query ProfileBlocks($id: ID!) {
        node(id: $id) {
          ... on Profile {
            profileBlocks(first: 10) {
              edges { node { id targetProfile { id handle displayName domain instanceKind } } }
            }
          }
        }
      }`,
      { id: globalId('Profile', owner.profile.id) },
      owner.token,
    );
    assertNoGraphQLErrors(managed);
    assert.deepEqual(
      managed.data?.node?.profileBlocks.edges.map(({ node }) => node.id).sort(),
      [localBlockId, remoteBlockId].sort(),
    );
    assert.deepEqual(
      managed.data?.node?.profileBlocks.edges.map(({ node }) => node.targetProfile.id).sort(),
      [
        globalId('ProfileBlockTarget', localTarget.id),
        globalId('ProfileBlockTarget', remoteTarget.id),
      ].sort(),
    );

    const localStatus = await profileBlockStatus(localTarget.handle, owner.token);
    assertNoGraphQLErrors(localStatus);
    assert.deepEqual(localStatus.data?.profileBlockStatus, {
      blocking: true,
      blockedBy: false,
      profileBlockId: localBlockId,
    });

    const unblocked = await requestGraphQL<{ unblockProfile: { profileBlockId: string | null } }>(
      `mutation UnblockProfile($id: ID!) {
        unblockProfile(input: { id: $id }) { profileBlockId }
      }`,
      { id: localBlockId },
      owner.token,
    );
    assertNoGraphQLErrors(unblocked);
    assert.deepEqual(unblocked.data?.unblockProfile, { profileBlockId: localBlockId });

    const restored = await requestGraphQL<{ node: { id: string } | null }>(
      `query RestoredProfile($id: ID!) {
        node(id: $id) { ... on Profile { id } }
      }`,
      { id: globalId('Profile', localTarget.id) },
      owner.token,
    );
    assertNoGraphQLErrors(restored);
    assert.deepEqual(restored.data?.node, { id: globalId('Profile', localTarget.id) });

    const restoredStatus = await profileBlockStatus(localTarget.handle, owner.token);
    assertNoGraphQLErrors(restoredStatus);
    assert.deepEqual(restoredStatus.data?.profileBlockStatus, {
      blocking: false,
      blockedBy: false,
      profileBlockId: null,
    });

    const deletedNode = await requestGraphQL<{ node: { id: string } | null }>(
      `query DeletedProfileBlock($id: ID!) {
        node(id: $id) { ... on ProfileBlock { id } }
      }`,
      { id: localBlockId },
      owner.token,
    );
    assertNoGraphQLErrors(deletedNode);
    assert.equal(deletedNode.data?.node, null);

    const remoteStillHidden = await requestGraphQL<{ node: { id: string } | null }>(
      `query RemoteProfile($id: ID!) {
        node(id: $id) { ... on Profile { id } }
      }`,
      { id: globalId('Profile', remoteTarget.id) },
      owner.token,
    );
    assertNoGraphQLErrors(remoteStillHidden);
    assert.equal(remoteStillHidden.data?.node, null);
  });

  test('keeps Block management owner-scoped and exposes reverse status without the other ID', async () => {
    const owner = await createAuthenticatedSession();
    const target = await createProfile('blocked-target');
    const targetSession = await createAuthenticatedSession(target);
    const other = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance('remote-selected.example');
    const remoteSelected = await createProfile('remote-selected', remoteInstance.id);
    const remoteSession = await createAuthenticatedSession(remoteSelected);

    const created = await blockProfile(target.id, owner.token);
    assertNoGraphQLErrors(created);
    const blockId = created.data?.blockProfile.profileBlock.id;
    assert.ok(blockId);

    const targetStatus = await profileBlockStatus(owner.profile.handle, targetSession.token);
    assertNoGraphQLErrors(targetStatus);
    assert.deepEqual(targetStatus.data?.profileBlockStatus, {
      blocking: false,
      blockedBy: true,
      profileBlockId: null,
    });

    const targetNode = await requestGraphQL<{ node: { id: string } | null }>(
      `query OtherBlockNode($id: ID!) {
        node(id: $id) { ... on ProfileBlock { id } }
      }`,
      { id: blockId },
      targetSession.token,
    );
    assertNoGraphQLErrors(targetNode);
    assert.equal(targetNode.data?.node, null);

    const otherNode = await requestGraphQL(
      `query OtherBlockList($id: ID!) {
        node(id: $id) {
          ... on Profile { profileBlocks(first: 10) { edges { node { id } } } }
        }
      }`,
      { id: globalId('Profile', owner.profile.id) },
      other.token,
    );
    assertGraphQLErrorCode(otherNode, 'PERMISSION_DENIED');

    const unauthorizedUnblock = await requestGraphQL(
      `mutation UnblockAsTarget($id: ID!) {
        unblockProfile(input: { id: $id }) { profileBlockId }
      }`,
      { id: blockId },
      targetSession.token,
    );
    assertGraphQLErrorCode(unauthorizedUnblock, 'NOT_FOUND');

    const anonymousBlock = await blockProfile(target.id);
    assertGraphQLErrorCode(anonymousBlock, 'PERMISSION_DENIED');

    const remoteBlock = await blockProfile(owner.profile.id, remoteSession.token);
    assertGraphQLErrorCode(remoteBlock, 'PERMISSION_DENIED');

    assert.equal(
      await db
        .select()
        .from(ProfileBlocks)
        .where(
          and(
            eq(ProfileBlocks.ownerProfileId, owner.profile.id),
            eq(ProfileBlocks.targetProfileId, target.id),
          ),
        )
        .then((rows) => rows.length),
      1,
    );
  });

  test('uses the current selected actor after a same-operation Profile switch', async () => {
    const ownerA = await createAuthenticatedSession();
    const ownerB = await createProfile('owner-b');
    await db.insert(AccountProfiles).values({
      accountId: ownerA.account.id,
      profileId: ownerB.id,
      role: AccountProfileRole.OWNER,
    });
    const target = await createProfile('switch-target');

    const created = await blockProfile(target.id, ownerA.token);
    assertNoGraphQLErrors(created);
    const blockId = created.data?.blockProfile.profileBlock.id;
    assert.ok(blockId);

    const switchedAndRetried = await requestGraphQL(
      `mutation SwitchAndRetry($ownerB: ID!, $target: ID!, $block: ID!) {
        first: blockProfile(input: { id: $target }) { profileBlock { id } }
        switch: selectProfile(input: { id: $ownerB }) { profile { id } }
        second: unblockProfile(input: { id: $block }) { profileBlockId }
      }`,
      {
        block: blockId,
        ownerB: globalId('Profile', ownerB.id),
        target: globalId('Profile', target.id),
      },
      ownerA.token,
    );
    assertGraphQLErrorCode(switchedAndRetried, 'NOT_FOUND');
    assert.equal(
      await db
        .select()
        .from(ProfileBlocks)
        .where(eq(ProfileBlocks.id, decodeGlobalId(blockId).id))
        .then((rows) => rows.length),
      1,
    );

    const switchBack = await requestGraphQL(
      `mutation SwitchBack($ownerA: ID!) {
        selectProfile(input: { id: $ownerA }) { profile { id } }
      }`,
      { ownerA: globalId('Profile', ownerA.profile.id) },
      ownerA.token,
    );
    assertNoGraphQLErrors(switchBack);

    const unblocked = await requestGraphQL<{ unblockProfile: { profileBlockId: string | null } }>(
      `mutation UnblockAfterSwitch($id: ID!) {
        unblockProfile(input: { id: $id }) { profileBlockId }
      }`,
      { id: blockId },
      ownerA.token,
    );
    assertNoGraphQLErrors(unblocked);
    assert.deepEqual(unblocked.data?.unblockProfile, { profileBlockId: blockId });
  });

  test('keeps blocked account profiles available for actor switching', async () => {
    const ownerA = await createAuthenticatedSession();
    const ownerB = await createProfile('owner-b');
    await db.insert(AccountProfiles).values({
      accountId: ownerA.account.id,
      profileId: ownerB.id,
      role: AccountProfileRole.OWNER,
    });

    const blocked = await blockProfile(ownerB.id, ownerA.token);
    assertNoGraphQLErrors(blocked);

    const result = await requestGraphQL<{
      me: { profiles: Array<{ id: string }> } | null;
      node: { id: string } | null;
    }>(
      `query AccountProfileSwitcher($id: ID!) {
        me { profiles { id } }
        node(id: $id) { ... on Profile { id } }
      }`,
      { id: globalId('Profile', ownerB.id) },
      ownerA.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.me?.profiles, [
      { id: globalId('Profile', ownerA.profile.id) },
      { id: globalId('Profile', ownerB.id) },
    ]);
    assert.equal(result.data?.node, null);
  });

  test('filters blocked Profile search candidates before applying cursor pagination', async () => {
    const owner = await createAuthenticatedSession();
    const blocked = await createProfile(
      'search-blocked-candidate',
      localInstanceId,
      '00000000-0000-8000-8000-000000000100',
    );
    const firstVisible = await createProfile(
      'search-visible-first',
      localInstanceId,
      '00000000-0000-8000-8000-000000000101',
    );
    const secondVisible = await createProfile(
      'search-visible-second',
      localInstanceId,
      '00000000-0000-8000-8000-000000000102',
    );

    const blockedResult = await blockProfile(blocked.id, owner.token);
    assertNoGraphQLErrors(blockedResult);

    const firstPage = await requestGraphQL<{
      searchProfiles: {
        edges: Array<{ node: { handle: string } }>;
        pageInfo: { endCursor: string | null; hasNextPage: boolean };
      };
    }>(
      `query SearchBlockedProfiles($after: String) {
        searchProfiles(query: "search-", first: 1, after: $after) {
          edges { node { handle } }
          pageInfo { endCursor hasNextPage }
        }
      }`,
      { after: null },
      owner.token,
    );

    assertNoGraphQLErrors(firstPage);
    assert.deepEqual(
      firstPage.data?.searchProfiles.edges.map(({ node }) => node.handle),
      [firstVisible.handle],
    );
    assert.equal(firstPage.data?.searchProfiles.pageInfo.hasNextPage, true);

    const secondPage = await requestGraphQL<typeof firstPage.data>(
      `query SearchBlockedProfiles($after: String) {
        searchProfiles(query: "search-", first: 1, after: $after) {
          edges { node { handle } }
          pageInfo { endCursor hasNextPage }
        }
      }`,
      { after: firstPage.data?.searchProfiles.pageInfo.endCursor },
      owner.token,
    );

    assertNoGraphQLErrors(secondPage);
    assert.deepEqual(
      secondPage.data?.searchProfiles.edges.map(({ node }) => node.handle),
      [secondVisible.handle],
    );
    assert.equal(secondPage.data?.searchProfiles.pageInfo.hasNextPage, false);
  });

  test('does not let residual Follow or Follow Request rows expose a blocked pair', async () => {
    const owner = await createAuthenticatedSession();
    const observer = await createAuthenticatedSession();
    const blocked = await createProfile('residual-follow-blocked');
    const control = await createProfile('residual-follow-control');
    const blockedPost = await createContentPost(blocked.id, undefined, PostVisibility.FOLLOWERS);
    const controlPost = await createContentPost(control.id, undefined, PostVisibility.FOLLOWERS);

    const blockedResult = await blockProfile(blocked.id, owner.token);
    assertNoGraphQLErrors(blockedResult);

    await db.insert(ProfileFollows).values([
      { followerProfileId: owner.profile.id, followeeProfileId: blocked.id },
      { followerProfileId: blocked.id, followeeProfileId: owner.profile.id },
      { followerProfileId: owner.profile.id, followeeProfileId: control.id },
    ]);
    await db
      .insert(ProfileFollowRequests)
      .values([{ followerProfileId: owner.profile.id, followeeProfileId: blocked.id }]);

    const result = await requestGraphQL<{
      profileByHandle: {
        followers: { edges: Array<{ node: { id: string } }> };
        following: { edges: Array<{ node: { id: string } }> };
        viewerState: {
          isSelf: boolean;
          follow: { id: string } | null;
          followRequest: { id: string } | null;
        } | null;
      } | null;
      homeTimeline: { edges: Array<{ node: { id: string } }> } | null;
    }>(
      `query ResidualBlockedRelations($handle: String!) {
        profileByHandle(handle: $handle) {
          followers(first: 10) { edges { node { id } } }
          following(first: 10) { edges { node { id } } }
          viewerState { isSelf follow { id } followRequest { id } }
        }
        homeTimeline(first: 10) { edges { node { id } } }
      }`,
      { handle: blocked.handle },
      observer.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle?.followers.edges, []);
    assert.deepEqual(result.data?.profileByHandle?.following.edges, []);
    assert.deepEqual(result.data?.profileByHandle?.viewerState, {
      isSelf: false,
      follow: null,
      followRequest: null,
    });
    assert.deepEqual(result.data?.homeTimeline?.edges, []);

    const ownerHome = await requestGraphQL<{
      homeTimeline: { edges: Array<{ node: { id: string } }> } | null;
    }>(
      `query ResidualBlockedHome {
        homeTimeline(first: 10) { edges { node { id } } }
      }`,
      {},
      owner.token,
    );
    assertNoGraphQLErrors(ownerHome);
    assert.deepEqual(
      ownerHome.data?.homeTimeline?.edges.map(({ node }) => node.id),
      [globalId('Post', controlPost.post.id)],
    );
    assert.equal(
      ownerHome.data?.homeTimeline?.edges.some(
        ({ node }) => node.id === globalId('Post', blockedPost.post.id),
      ),
      false,
    );
  });

  test('hides blocked Reposts, their PostContent and Media from posts and relation lists', async () => {
    const viewer = await createAuthenticatedSession();
    const repostAuthor = await createProfile('blocked-repost-author');
    const sourceAuthor = await createProfile('blocked-repost-source');
    const visibleAuthor = await createProfile('visible-repost-author');
    const media = await db
      .insert(Media)
      .values({
        mediaType: 'image/png',
        profileId: sourceAuthor.id,
        source: MediaSource.REMOTE,
        state: MediaState.READY,
        url: 'https://remote.example/blocked-repost.png',
      })
      .returning()
      .then(firstOrThrow);
    const source = await createContentPost(sourceAuthor.id, media.id);
    const repost = await db
      .insert(Posts)
      .values({
        profileId: repostAuthor.id,
        repostSourceId: source.post.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    const visible = await createContentPost(visibleAuthor.id);

    await db.insert(Bookmarks).values([
      { postId: repost.id, profileId: viewer.profile.id },
      { postId: visible.post.id, profileId: viewer.profile.id },
    ]);
    await db.insert(Reactions).values([
      { postId: visible.post.id, profileId: sourceAuthor.id, type: '❤️' },
      { postId: visible.post.id, profileId: visibleAuthor.id, type: '❤️' },
    ]);

    for (const profile of [repostAuthor, sourceAuthor]) {
      const blockedResult = await blockProfile(profile.id, viewer.token);
      assertNoGraphQLErrors(blockedResult);
    }

    const result = await requestGraphQL<{
      nodes: Array<
        | { __typename: 'Post'; id: string }
        | { __typename: 'PostContent'; id: string }
        | { __typename: 'Media'; id: string }
        | null
      >;
      viewer: {
        bookmarks: { edges: Array<{ node: { post: { id: string } } }> };
      } | null;
      reactionProfiles: {
        reactionProfiles: { edges: Array<{ node: { id: string } }> };
      } | null;
    }>(
      `query BlockedRepostRelations(
        $ids: [ID!]!
        $viewerId: ID!
        $postId: ID!
      ) {
        nodes(ids: $ids) { __typename id }
        viewer: node(id: $viewerId) {
          ... on Profile {
            bookmarks(first: 10) { edges { node { post { id } } } }
          }
        }
        reactionProfiles: node(id: $postId) {
          ... on Post {
            reactionProfiles(type: "❤️", first: 10) { edges { node { id } } }
          }
        }
      }`,
      {
        ids: [
          globalId('Post', repost.id),
          globalId('Post', source.post.id),
          globalId('PostContent', source.content.id),
          globalId('Media', media.id),
        ],
        postId: globalId('Post', visible.post.id),
        viewerId: globalId('Profile', viewer.profile.id),
      },
      viewer.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.nodes, [null, null, null, null]);
    assert.deepEqual(
      result.data?.viewer?.bookmarks.edges.map(({ node }) => node.post.id),
      [globalId('Post', visible.post.id)],
    );
    assert.deepEqual(
      result.data?.reactionProfiles?.reactionProfiles.edges.map(({ node }) => node.id),
      [globalId('Profile', visibleAuthor.id)],
    );
  });

  test('hides blocked Notification sources across mixed Node, connection, unread and Read paths', async () => {
    const auth = await createAuthenticatedSession();
    const secondRecipient = await createProfile('block-notification-second-recipient');
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: secondRecipient.id,
      role: AccountProfileRole.MEMBER,
    });
    const blockedSource = await createProfile('blocked-notification-source');
    const visibleSource = await createProfile('visible-notification-source');
    const recipientPost = await createContentPost(auth.profile.id);

    const blockedResult = await blockProfile(blockedSource.id, auth.token);
    assertNoGraphQLErrors(blockedResult);

    const [hiddenFollow, visibleFollow, secondRecipientFollow] = await Promise.all([
      createFollowNotification(auth.profile.id, blockedSource.id),
      createFollowNotification(auth.profile.id, visibleSource.id),
      createFollowNotification(secondRecipient.id, blockedSource.id),
    ]);
    const hiddenFollowRequest = await db
      .insert(ProfileFollowRequests)
      .values({ followerProfileId: blockedSource.id, followeeProfileId: auth.profile.id })
      .returning()
      .then(firstOrThrow);
    const hiddenReaction = await db
      .insert(Reactions)
      .values({ postId: recipientPost.post.id, profileId: blockedSource.id, type: '❤️' })
      .returning()
      .then(firstOrThrow);
    const hiddenRepost = await db
      .insert(Posts)
      .values({
        profileId: blockedSource.id,
        repostSourceId: recipientPost.post.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    const hiddenReply = await db
      .insert(Posts)
      .values({
        profileId: blockedSource.id,
        replyParentId: recipientPost.post.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    const createHiddenNotification = (kind: NotificationKind, sourceId: string) =>
      db
        .insert(Notifications)
        .values({ kind, recipientProfileId: auth.profile.id, sourceId })
        .returning()
        .then(firstOrThrow);
    const [
      hiddenFollowRequestNotification,
      hiddenReactionNotification,
      hiddenRepostNotification,
      hiddenReplyNotification,
    ] = await Promise.all([
      createHiddenNotification(NotificationKind.FOLLOW_REQUEST, hiddenFollowRequest.id),
      createHiddenNotification(NotificationKind.REACTION, hiddenReaction.id),
      createHiddenNotification(NotificationKind.REPOST, hiddenRepost.id),
      createHiddenNotification(NotificationKind.REPLY, hiddenReply.id),
    ]);
    const hiddenIds = [
      globalId('FollowNotification', hiddenFollow.id),
      globalId('FollowRequestNotification', hiddenFollowRequestNotification.id),
      globalId('ReactionNotification', hiddenReactionNotification.id),
      globalId('RepostNotification', hiddenRepostNotification.id),
      globalId('ReplyNotification', hiddenReplyNotification.id),
    ];
    const visibleId = globalId('FollowNotification', visibleFollow.id);
    const secondRecipientId = globalId('FollowNotification', secondRecipientFollow.id);
    const recipientId = globalId('Profile', auth.profile.id);
    const secondRecipientProfileId = globalId('Profile', secondRecipient.id);

    const result = await requestGraphQL<{
      nodes: Array<{ __typename: string; id: string } | null>;
      recipient: {
        notifications: { edges: Array<{ node: { id: string } }> };
      } | null;
      unread: Array<{ id: string; unreadNotificationCount: number } | null>;
    }>(
      `query BlockedNotifications($ids: [ID!]!, $recipientId: ID!, $unreadIds: [ID!]!) {
        nodes(ids: $ids) { __typename id }
        recipient: node(id: $recipientId) {
          ... on Profile { notifications(first: 10) { edges { node { id } } } }
        }
        unread: nodes(ids: $unreadIds) {
          ... on Profile { id unreadNotificationCount }
        }
      }`,
      {
        ids: [...hiddenIds, visibleId, secondRecipientId, secondRecipientProfileId],
        recipientId,
        unreadIds: [recipientId, secondRecipientProfileId],
      },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.nodes, [
      null,
      null,
      null,
      null,
      null,
      { __typename: 'FollowNotification', id: visibleId },
      { __typename: 'FollowNotification', id: secondRecipientId },
      { __typename: 'Profile', id: secondRecipientProfileId },
    ]);
    assert.deepEqual(
      result.data?.recipient?.notifications.edges.map(({ node }) => node.id),
      [visibleId],
    );
    assert.deepEqual(result.data?.unread, [
      { id: recipientId, unreadNotificationCount: 1 },
      { id: secondRecipientProfileId, unreadNotificationCount: 1 },
    ]);

    const marked = await markNotificationRead(
      [...hiddenIds, visibleId, secondRecipientId, secondRecipientProfileId],
      auth.token,
    );
    assertNoGraphQLErrors(marked);
    assert.deepEqual(
      marked.data?.markNotificationRead.notifications.map(({ id }) => id).toSorted(),
      [visibleId, secondRecipientId].toSorted(),
    );
    assert.deepEqual(
      marked.data?.markNotificationRead.recipientProfiles
        .map(({ id, unreadNotificationCount }) => [id, unreadNotificationCount])
        .toSorted(),
      [
        [recipientId, 0],
        [secondRecipientProfileId, 0],
      ].toSorted(),
    );

    const persistedReads = await db
      .select({ id: Notifications.id, readAt: Notifications.readAt })
      .from(Notifications)
      .where(
        inArray(Notifications.id, [
          hiddenFollow.id,
          hiddenFollowRequestNotification.id,
          hiddenReactionNotification.id,
          hiddenRepostNotification.id,
          hiddenReplyNotification.id,
          visibleFollow.id,
          secondRecipientFollow.id,
        ]),
      );
    const readAtById = new Map(persistedReads.map(({ id, readAt }) => [id, readAt]));
    assert.deepEqual(
      [
        hiddenFollow.id,
        hiddenFollowRequestNotification.id,
        hiddenReactionNotification.id,
        hiddenRepostNotification.id,
        hiddenReplyNotification.id,
      ].map((id) => readAtById.get(id)),
      [null, null, null, null, null],
    );
    assert.ok(readAtById.get(visibleFollow.id));
    assert.ok(readAtById.get(secondRecipientFollow.id));
  });
});

const blockProfile = (profileId: string, token?: string) =>
  requestGraphQL<{
    blockProfile: {
      profileBlock: {
        id: string;
        targetProfile: {
          id: string;
          handle: string;
          displayName: string;
          domain: string;
          instanceKind: string;
        };
      };
    };
  }>(
    `mutation BlockProfile($id: ID!) {
      blockProfile(input: { id: $id }) {
        profileBlock {
          id
          targetProfile { id handle displayName domain instanceKind }
        }
      }
    }`,
    { id: globalId('Profile', profileId) },
    token,
  );

const profileBlockStatus = (handle: string, token?: string) =>
  requestGraphQL<{
    profileBlockStatus: { blocking: boolean; blockedBy: boolean; profileBlockId: string | null };
  }>(
    `query ProfileBlockStatus($handle: String!) {
      profileBlockStatus(handle: $handle) { blocking blockedBy profileBlockId }
    }`,
    { handle },
    token,
  );

const requestGraphQL = async <TData>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<GraphQLResult<TData>> => {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await app.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers,
    method: 'POST',
  });

  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const assertGraphQLErrorCode = (result: GraphQLResult<unknown>, code: string) => {
  assert.equal(result.errors?.[0]?.extensions?.code, code, JSON.stringify(result.errors));
};

const createFollowNotification = async (recipientProfileId: string, relatedProfileId: string) => {
  const follow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId: relatedProfileId, followeeProfileId: recipientProfileId })
    .returning()
    .then(firstOrThrow);
  return db
    .insert(Notifications)
    .values({
      kind: NotificationKind.FOLLOW,
      recipientProfileId,
      sourceId: follow.id,
    })
    .returning()
    .then(firstOrThrow);
};

const markNotificationRead = (ids: string[], token?: string) =>
  requestGraphQL<{
    markNotificationRead: {
      notifications: Array<{ id: string; readAt: string | null }>;
      recipientProfiles: Array<{ id: string; unreadNotificationCount: number }>;
    };
  }>(
    `mutation MarkBlockedNotificationRead($ids: [ID!]!) {
      markNotificationRead(input: { ids: $ids }) {
        notifications { id readAt }
        recipientProfiles { id unreadNotificationCount }
      }
    }`,
    { ids },
    token,
  );

const createRemoteInstance = async (domain = 'remote.example') =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createProfile = async (
  handle: string,
  instanceId = localInstanceId,
  id?: string,
): Promise<ProfileRow> =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      ...(id === undefined ? {} : { id }),
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createContentPost = async (
  profileId: string,
  mediaId?: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({
      document: mediaId
        ? postContentDocumentFromTextAndMedia('', [{ mediaId }])
        : postContentDocumentFromText(post.id),
      postId: post.id,
    })
    .returning()
    .then(firstOrThrow);
  const updatedPost = await db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);

  return { content, post: updatedPost };
};

const createAuthenticatedSession = async (profile?: ProfileRow) => {
  const selectedProfile =
    profile ?? (await createProfile(`viewer-${crypto.randomUUID().slice(0, 8)}`));
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Test Account',
      oidcSubject: `subject-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: selectedProfile.id,
    role: AccountProfileRole.OWNER,
  });
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: selectedProfile.id,
      state: SessionState.ACTIVE,
      token: `token-${crypto.randomUUID()}`,
    })
    .returning()
    .then(firstOrThrow);

  return { account, profile: selectedProfile, session, token: session.token };
};

const resetFixtures = async () => {
  await db.delete(Bookmarks);
  await db.delete(Reactions);
  await db.delete(Notifications);
  await db.delete(ProfileFollowRequests);
  await db.delete(ProfileFollows);
  await db.update(Posts).set({ currentContentId: null, replyParentId: null, repostSourceId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Media);
  await db.delete(ProfileBlocks);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db.delete(Instances).where(eq(Instances.kind, InstanceKind.ACTIVITYPUB));
  await db
    .delete(Instances)
    .where(and(eq(Instances.kind, InstanceKind.LOCAL), ne(Instances.id, localInstanceId)));
};

const truncateDatabase = async () => {
  const testDatabaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(new Set(['127.0.0.1', '[::1]', 'localhost']).has(testDatabaseUrl.hostname));
  assert.match(testDatabaseUrl.pathname, /^\/kosmo_test(?:_[a-z0-9_]+)?$/);

  await pg.unsafe(`
    DO $$
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement || ' CASCADE';
      END IF;
    END $$;
  `);
};
