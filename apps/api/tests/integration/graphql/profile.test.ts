import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { Create, Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import {
  AccountProfileRole,
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { isConfiguredLocalProfile } from '@kosmo/core/profile';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, count, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { encodeGlobalId as globalId } from '../../../src/graphql/global-id';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { handleInboundCreate as HandleInboundCreate } from '../../../../../packages/fedify/src/inbound-create';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const localDomain = '127.0.0.1:4173';
const remoteDomain = 'remote.example';
const databaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let Profiles: typeof CoreDb.Profiles;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let handleInboundCreate: typeof HandleInboundCreate;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL remote profile boundary', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      pg,
      ProfileFollows,
      ProfileFollowRequests,
      Profiles,
      PostContents,
      Posts,
      Sessions,
    } = await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));
    ({ handleInboundCreate } = await import('../../../../../packages/fedify/src/inbound-create'));

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

  beforeEach(async () => {
    await resetFixtures();
  });

  after(async () => {
    await pg.end();
  });

  test('does not treat a malformed profile without an instance as local', () => {
    const malformedProfile = { instanceId: null } as unknown as { instanceId: string };

    assert.equal(isConfiguredLocalProfile(malformedProfile, { id: localInstanceId }), false);
  });

  test('looks up local and stored remote profiles without materializing missing handles', async () => {
    const local = await createProfile({ handle: 'alice', instanceId: localInstanceId });
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'bob', instanceId: remoteInstance.id });

    const cases = [
      ['alice', local.id, 'LOCAL', '@alice'],
      [`alice@${localDomain}`, local.id, 'LOCAL', '@alice'],
      [`@alice@${localDomain}`, local.id, 'LOCAL', '@alice'],
      [`bob@${remoteDomain}`, remote.id, 'ACTIVITYPUB', `@bob@${remoteDomain}`],
      [`@bob@${remoteDomain}`, remote.id, 'ACTIVITYPUB', `@bob@${remoteDomain}`],
    ] as const;

    for (const [handle, id, kind, relativeHandle] of cases) {
      const result = await requestGraphQL<{
        profileByHandle: {
          id: string;
          instance: { kind: string };
          relativeHandle: string;
        } | null;
      }>(
        `query ProfileByHandle($handle: String!) {
          profileByHandle(handle: $handle) {
            id
            instance { kind }
            relativeHandle
          }
        }`,
        { handle },
      );

      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.profileByHandle, {
        id: globalId('Profile', id),
        instance: { kind },
        relativeHandle,
      });
    }

    const profileCountBefore = await countRows(Profiles);
    const missing = await requestGraphQL<{ profileByHandle: null }>(
      `query MissingRemote($handle: String!) {
        profileByHandle(handle: $handle) { id }
      }`,
      { handle: `missing@${remoteDomain}` },
    );

    assertNoGraphQLErrors(missing);
    assert.equal(missing.data?.profileByHandle, null);
    assert.equal(await countRows(Profiles), profileCountBefore);
  });

  test('loads an active remote profile through the Node interface', async () => {
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({
      handle: 'alice',
      id: '00000000-0000-8006-8000-000000000001',
      instanceId: remoteInstance.id,
    });

    const result = await requestGraphQL<{
      node: {
        __typename: string;
        id: string;
        instance: { kind: string };
        relativeHandle: string;
      } | null;
    }>(
      `query RemoteNode($id: ID!) {
        node(id: $id) {
          __typename
          ... on Profile {
            id
            instance { kind }
            relativeHandle
          }
        }
      }`,
      { id: globalId('Profile', remote.id) },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      __typename: 'Profile',
      id: globalId('Profile', remote.id),
      instance: { kind: 'ACTIVITYPUB' },
      relativeHandle: `@alice@${remoteDomain}`,
    });
  });

  test('keeps mixed Node batch order and does not retry a mismatched typename', async () => {
    const remoteInstance = await createRemoteInstance();
    const firstProfile = await createProfile({
      handle: 'batch-first',
      instanceId: remoteInstance.id,
    });
    const secondProfile = await createProfile({
      handle: 'batch-second',
      instanceId: remoteInstance.id,
    });
    const missingId = crypto.randomUUID();

    const result = await requestGraphQL<{
      nodes: Array<{ __typename: string; id: string } | null>;
    }>(
      `query Nodes($ids: [ID!]!) {
        nodes(ids: $ids) { __typename id }
      }`,
      {
        ids: [
          globalId('Profile', firstProfile.id),
          globalId('Profile', missingId),
          globalId('Post', secondProfile.id),
          globalId('Profile', secondProfile.id),
        ],
      },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.nodes, [
      { __typename: 'Profile', id: globalId('Profile', firstProfile.id) },
      null,
      null,
      { __typename: 'Profile', id: globalId('Profile', secondProfile.id) },
    ]);
  });

  test('reports the owning instance kind for a profile outside the configured local instance', async () => {
    const otherLocalInstance = await db
      .insert(Instances)
      .values({
        canonicalOrigin: 'https://other-local.example',
        domain: 'other-local.example',
        kind: InstanceKind.LOCAL,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    const profile = await createProfile({
      handle: 'other-local',
      instanceId: otherLocalInstance.id,
    });

    const result = await requestGraphQL<{
      node: { instance: { kind: string } } | null;
    }>(
      `query OtherLocalProfileInstance($id: ID!) {
        node(id: $id) {
          ... on Profile { instance { kind } }
        }
      }`,
      { id: globalId('Profile', profile.id) },
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.instance.kind, 'LOCAL');
  });

  test('reads active posts for profiles on another local instance', async () => {
    const otherLocalInstance = await createLocalInstance({ domain: 'other-local.example' });
    const otherLocal = await createProfile({
      handle: 'other-local',
      instanceId: otherLocalInstance.id,
    });
    const post = await db
      .insert(Posts)
      .values({
        profileId: otherLocal.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);

    const result = await requestGraphQL<{
      post: { id: string } | null;
      node: { posts: { edges: Array<{ node: { id: string } }> } } | null;
    }>(
      `query OtherLocalPosts($postId: ID!, $profileId: ID!) {
        post: node(id: $postId) { ... on Post { id } }
        node(id: $profileId) {
          ... on Profile { posts(first: 10) { edges { node { id } } } }
        }
      }`,
      { postId: globalId('Post', post.id), profileId: globalId('Profile', otherLocal.id) },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      post: { id: globalId('Post', post.id) },
      node: { posts: { edges: [{ node: { id: globalId('Post', post.id) } }] } },
    });
  });

  test('reads stored active remote posts through the general visibility policy', async () => {
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({
      handle: 'remote-post-author',
      instanceId: remoteInstance.id,
    });
    const post = await db
      .insert(Posts)
      .values({
        profileId: remote.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);

    const result = await requestGraphQL<{
      post: { id: string } | null;
      node: { posts: { edges: Array<{ node: { id: string } }> } } | null;
    }>(
      `query StoredRemotePosts($postId: ID!, $profileId: ID!) {
        post: node(id: $postId) { ... on Post { id } }
        node(id: $profileId) {
          ... on Profile { posts(first: 10) { edges { node { id } } } }
        }
      }`,
      { postId: globalId('Post', post.id), profileId: globalId('Profile', remote.id) },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      post: { id: globalId('Post', post.id) },
      node: { posts: { edges: [{ node: { id: globalId('Post', post.id) } }] } },
    });
  });

  test('hides suspended-instance posts from Node and home timeline', async () => {
    const auth = await createAuthenticatedSession();
    const suspendedInstance = await createRemoteInstance({
      domain: 'suspended.example',
      state: InstanceState.SUSPENDED,
    });
    const suspended = await createProfile({
      handle: 'suspended',
      instanceId: suspendedInstance.id,
    });
    const suspendedPost = await db
      .insert(Posts)
      .values({
        profileId: suspended.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    await db.insert(ProfileFollows).values({
      followerProfileId: auth.profile.id,
      followeeProfileId: suspended.id,
    });

    const result = await requestGraphQL<{
      suspendedPost: { id: string } | null;
      homeTimeline: { edges: unknown[] } | null;
    }>(
      `query HiddenSuspendedPosts($suspendedPostId: ID!) {
        suspendedPost: node(id: $suspendedPostId) {
          ... on Post { id }
        }
        homeTimeline(first: 10) { edges { node { id } } }
      }`,
      { suspendedPostId: globalId('Post', suspendedPost.id) },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      suspendedPost: null,
      homeTimeline: { edges: [] },
    });
  });

  test('hides suspended-instance post contents from Node', async () => {
    const suspendedInstance = await createRemoteInstance({
      domain: 'suspended.example',
      state: InstanceState.SUSPENDED,
    });
    const suspended = await createProfile({
      handle: 'suspended',
      instanceId: suspendedInstance.id,
    });
    const suspendedPost = await db
      .insert(Posts)
      .values({
        profileId: suspended.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    const suspendedContent = await db
      .insert(PostContents)
      .values({
        document: postContentDocumentFromText('suspended content'),
        postId: suspendedPost.id,
      })
      .returning()
      .then(firstOrThrow);

    const result = await requestGraphQL<{
      suspendedContent: { id: string } | null;
    }>(
      `query HiddenSuspendedPostContents($suspendedContentId: ID!) {
        suspendedContent: node(id: $suspendedContentId) {
          ... on PostContent { id }
        }
      }`,
      { suspendedContentId: globalId('PostContent', suspendedContent.id) },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      suspendedContent: null,
    });
  });

  test('includes active profiles from another local instance in an account profile list', async () => {
    const auth = await createAuthenticatedSession();
    const otherLocalInstance = await createLocalInstance({ domain: 'other-local.example' });
    const otherLocal = await createProfile({
      handle: 'other-local',
      instanceId: otherLocalInstance.id,
    });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: otherLocal.id,
      role: AccountProfileRole.OWNER,
    });

    const result = await requestGraphQL<{
      me: { profiles: Array<{ id: string }> } | null;
    }>(
      `query AccountProfiles {
        me { profiles { id } }
      }`,
      {},
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.me?.profiles, [
      { id: globalId('Profile', auth.profile.id) },
      { id: globalId('Profile', otherLocal.id) },
    ]);
  });

  test('restores an active profile from another local instance in the session context', async () => {
    const auth = await createAuthenticatedSession();
    const otherLocalInstance = await createLocalInstance({ domain: 'other-local.example' });
    const otherLocal = await createProfile({
      handle: 'other-local',
      instanceId: otherLocalInstance.id,
    });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: otherLocal.id,
      role: AccountProfileRole.OWNER,
    });
    await db
      .update(Sessions)
      .set({ activeProfileId: otherLocal.id })
      .where(eq(Sessions.id, auth.session.id));

    const result = await requestGraphQL<{
      createPost: {
        post: {
          content: {
            document: unknown;
            bodyText: string;
          } | null;
        };
      };
    }>(
      `mutation CreatePostWithOtherLocalSession($bodyText: String!) {
        createPost(input: { bodyText: $bodyText, visibility: UNLISTED }) {
          post {
            content { document bodyText }
          }
        }
      }`,
      { bodyText: 'first\r\nsecond' },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.createPost.post.content, {
      document: {
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'first' },
                { type: 'hard_break' },
                { type: 'text', text: 'second' },
              ],
            },
          ],
        },
      },
      bodyText: 'first\nsecond',
    });
  });

  test('selects an owned active remote profile and restores it from the session', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'owned-remote', instanceId: remoteInstance.id });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: remote.id,
      role: AccountProfileRole.OWNER,
    });

    const selected = await requestGraphQL<{
      selectProfile: {
        profile: { id: string; instance: { kind: string } };
        session: { selectedProfile: { id: string; instance: { kind: string } } | null };
      };
    }>(
      `mutation SelectRemote($id: ID!) {
        selectProfile(input: { id: $id }) {
          profile { id instance { kind } }
          session { selectedProfile { id instance { kind } } }
        }
      }`,
      { id: globalId('Profile', remote.id) },
      auth.token,
    );

    assertNoGraphQLErrors(selected);
    assert.deepEqual(selected.data?.selectProfile, {
      profile: { id: globalId('Profile', remote.id), instance: { kind: 'ACTIVITYPUB' } },
      session: {
        selectedProfile: {
          id: globalId('Profile', remote.id),
          instance: { kind: 'ACTIVITYPUB' },
        },
      },
    });

    const restored = await requestGraphQL<{
      currentSession: { selectedProfile: { id: string; instance: { kind: string } } | null } | null;
    }>(
      `query CurrentRemoteSession {
        currentSession { selectedProfile { id instance { kind } } }
      }`,
      {},
      auth.token,
    );

    assertNoGraphQLErrors(restored);
    assert.deepEqual(restored.data?.currentSession?.selectedProfile, {
      id: globalId('Profile', remote.id),
      instance: { kind: 'ACTIVITYPUB' },
    });
  });

  test('rejects remote profile selection without ownership by the session account', async () => {
    const auth = await createAuthenticatedSession();
    const otherAuth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const unownedRemote = await createProfile({
      handle: 'unowned-remote',
      instanceId: remoteInstance.id,
    });
    const otherOwnedRemote = await createProfile({
      handle: 'other-owned-remote',
      instanceId: remoteInstance.id,
    });
    await db.insert(AccountProfiles).values({
      accountId: otherAuth.account.id,
      profileId: otherOwnedRemote.id,
      role: AccountProfileRole.OWNER,
    });

    for (const id of [unownedRemote.id, otherOwnedRemote.id]) {
      const result = await requestGraphQL(
        `mutation SelectUnownedRemote($id: ID!) {
          selectProfile(input: { id: $id }) { profile { id } }
        }`,
        { id: globalId('Profile', id) },
        auth.token,
      );

      assertGraphQLErrorCode(result, 'NOT_FOUND');
    }

    const session = await db
      .select()
      .from(Sessions)
      .where(eq(Sessions.id, auth.session.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(session.activeProfileId, auth.profile.id);
  });

  test('rejects an owned remote profile when it is inactive or its instance is suspended', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({
      handle: 'invisible-remote',
      instanceId: remoteInstance.id,
    });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: remote.id,
      role: AccountProfileRole.OWNER,
    });

    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, remote.id));

    const inactive = await requestGraphQL(
      `mutation SelectInactiveRemote($id: ID!) {
        selectProfile(input: { id: $id }) { profile { id } }
      }`,
      { id: globalId('Profile', remote.id) },
      auth.token,
    );

    assertGraphQLErrorCode(inactive, 'NOT_FOUND');

    await db.update(Profiles).set({ state: ProfileState.ACTIVE }).where(eq(Profiles.id, remote.id));
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, remoteInstance.id));

    const suspended = await requestGraphQL(
      `mutation SelectSuspendedRemote($id: ID!) {
        selectProfile(input: { id: $id }) { profile { id } }
      }`,
      { id: globalId('Profile', remote.id) },
      auth.token,
    );

    assertGraphQLErrorCode(suspended, 'NOT_FOUND');

    await db
      .update(Sessions)
      .set({ activeProfileId: remote.id })
      .where(eq(Sessions.id, auth.session.id));

    const restored = await requestGraphQL<{
      currentSession: { selectedProfile: { id: string } | null } | null;
    }>(
      `query CurrentSuspendedRemoteSession {
        currentSession { selectedProfile { id } }
      }`,
      {},
      auth.token,
    );

    assertNoGraphQLErrors(restored);
    assert.equal(restored.data?.currentSession?.selectedProfile, null);
  });

  test('follows an unresponsive remote profile without outbound delivery', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance({ state: InstanceState.UNRESPONSIVE });
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await createRemoteActor(remote.id, remoteInstance.domain);

    const result = await requestGraphQL<{
      followProfile: {
        followeeProfile: { followersCount: number; id: string };
        followerProfile: { followingCount: number; id: string };
        result: { __typename: string; id: string };
      };
    }>(
      `mutation FollowRemote($id: ID!) {
        followProfile(input: { id: $id }) {
          followeeProfile { followersCount id }
          followerProfile { followingCount id }
          result { __typename ... on ProfileFollow { id } }
        }
      }`,
      { id: globalId('Profile', remote.id) },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.followProfile.followeeProfile.followersCount, 1);
    assert.equal(result.data?.followProfile.followerProfile.followingCount, 1);
    assert.equal(result.data?.followProfile.result.__typename, 'ProfileFollow');
    assert.equal(await countRows(ProfileFollows), 1);
  });

  test('returns committed GraphQL payloads when post-commit Follow and Undo delivery fails', async () => {
    const auth = await createAuthenticatedSession();
    const openInstance = await createRemoteInstance({ domain: 'delivery-open.remote.example' });
    const openRemote = await createProfile({
      handle: 'delivery-open',
      instanceId: openInstance.id,
    });
    await createRemoteActor(openRemote.id, openInstance.domain, { withInbox: false });
    const errorLog = mock.method(console, 'error', () => undefined);

    try {
      const followed = await requestGraphQL<{
        followProfile: {
          followeeProfile: { followersCount: number; id: string };
          followerProfile: { followingCount: number; id: string };
          result: { __typename: string; id: string };
        };
      }>(
        `mutation FollowRemoteAfterDeliveryFailure($id: ID!) {
          followProfile(input: { id: $id }) {
            followeeProfile { followersCount id }
            followerProfile { followingCount id }
            result { __typename ... on ProfileFollow { id } }
          }
        }`,
        { id: globalId('Profile', openRemote.id) },
        auth.token,
      );
      assertNoGraphQLErrors(followed);
      assert.equal(followed.data?.followProfile.result.__typename, 'ProfileFollow');
      assert.equal(followed.data?.followProfile.followerProfile.followingCount, 1);
      assert.equal(followed.data?.followProfile.followeeProfile.followersCount, 1);
      assert.equal(await countRows(ProfileFollows), 1);

      const unfollowed = await requestGraphQL<{
        unfollowProfile: {
          followeeProfile: { followersCount: number };
          followerProfile: { followingCount: number };
          profileFollowId: string;
        };
      }>(
        `mutation UnfollowRemoteAfterDeliveryFailure($id: ID!) {
          unfollowProfile(input: { id: $id }) {
            followeeProfile { followersCount }
            followerProfile { followingCount }
            profileFollowId
          }
        }`,
        { id: globalId('Profile', openRemote.id) },
        auth.token,
      );
      assertNoGraphQLErrors(unfollowed);
      assert.ok(unfollowed.data?.unfollowProfile.profileFollowId);
      assert.equal(unfollowed.data?.unfollowProfile.followerProfile.followingCount, 0);
      assert.equal(unfollowed.data?.unfollowProfile.followeeProfile.followersCount, 0);
      assert.equal(await countRows(ProfileFollows), 0);

      const approvalInstance = await createRemoteInstance({
        domain: 'delivery-approval.remote.example',
      });
      const approvalRemote = await createProfile({
        followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
        handle: 'delivery-approval',
        instanceId: approvalInstance.id,
      });
      await createRemoteActor(approvalRemote.id, approvalInstance.domain, { withInbox: false });

      const requested = await requestGraphQL<{
        followProfile: {
          followeeProfile: { followersCount: number };
          followerProfile: { followingCount: number };
          result: { __typename: string; id: string };
        };
      }>(
        `mutation RequestRemoteFollowAfterDeliveryFailure($id: ID!) {
          followProfile(input: { id: $id }) {
            followeeProfile { followersCount }
            followerProfile { followingCount }
            result { __typename ... on ProfileFollowRequest { id } }
          }
        }`,
        { id: globalId('Profile', approvalRemote.id) },
        auth.token,
      );
      assertNoGraphQLErrors(requested);
      assert.equal(requested.data?.followProfile.result.__typename, 'ProfileFollowRequest');
      assert.equal(requested.data?.followProfile.followerProfile.followingCount, 0);
      assert.equal(requested.data?.followProfile.followeeProfile.followersCount, 0);
      assert.equal(await countRows(ProfileFollowRequests), 1);

      const requestId = requested.data!.followProfile.result.id;
      const canceled = await requestGraphQL<{
        cancelProfileFollowRequest: {
          followerProfile: { followingCount: number; id: string };
          profileFollowRequestId: string;
        };
      }>(
        `mutation CancelRemoteFollowAfterDeliveryFailure($id: ID!) {
          cancelProfileFollowRequest(input: { id: $id }) {
            followerProfile { followingCount id }
            profileFollowRequestId
          }
        }`,
        { id: requestId },
        auth.token,
      );
      assertNoGraphQLErrors(canceled);
      assert.deepEqual(canceled.data?.cancelProfileFollowRequest, {
        followerProfile: {
          followingCount: 0,
          id: globalId('Profile', auth.profile.id),
        },
        profileFollowRequestId: requestId,
      });
      assert.equal(await countRows(ProfileFollowRequests), 0);
      assert.equal(errorLog.mock.callCount(), 4);
    } finally {
      errorLog.mock.restore();
    }
  });

  test('delivers signed Follow and Undo activities for an active remote profile', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await createRemoteActor(remote.id, remoteInstance.domain);
    const remoteActorUri = `https://${remoteInstance.domain}/users/remote`;
    const remoteInboxUri = `https://${remoteInstance.domain}/users/remote/inbox`;
    const requests: Request[] = [];
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push(request.clone());
        return new Response(null, { status: 202 });
      },
    );

    let profileFollow: typeof ProfileFollows.$inferSelect;
    try {
      const followed = await requestGraphQL(
        `mutation FollowActiveRemote($id: ID!) {
          followProfile(input: { id: $id }) {
            result { __typename ... on ProfileFollow { id } }
          }
        }`,
        { id: globalId('Profile', remote.id) },
        auth.token,
      );
      assertNoGraphQLErrors(followed);

      profileFollow = await db
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, auth.profile.id),
            eq(ProfileFollows.followeeProfileId, remote.id),
          ),
        )
        .limit(1)
        .then(firstOrThrow);

      const unfollowed = await requestGraphQL(
        `mutation UnfollowActiveRemote($id: ID!) {
          unfollowProfile(input: { id: $id }) { profileFollowId }
        }`,
        { id: globalId('Profile', remote.id) },
        auth.token,
      );
      assertNoGraphQLErrors(unfollowed);
    } finally {
      fetchMock.mock.restore();
    }

    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.url, remoteInboxUri);
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('content-type'), 'application/activity+json');
      assert.ok(request.headers.has('signature'));
      assert.ok(request.headers.has('signature-input'));
    }

    const [follow, undo] = await Promise.all(
      requests.map(async (request) => (await request.json()) as Record<string, unknown>),
    );
    const actorUri = `${publicOrigin}/ap/actor/${auth.profile.id}`;
    const followUri = `${publicOrigin}/ap/follow/${profileFollow.id}`;

    assert.equal(follow?.type, 'Follow');
    assert.equal(follow?.id, followUri);
    assert.equal(follow?.actor, actorUri);
    assert.equal(follow?.object, remoteActorUri);
    assert.equal(follow?.published, profileFollow.createdAt.toString());

    assert.equal(undo?.type, 'Undo');
    assert.equal(undo?.actor, actorUri);
    assert.ok(typeof undo?.id === 'string');
    assert.deepEqual(undo?.object, {
      actor: actorUri,
      id: followUri,
      object: remoteActorUri,
      published: profileFollow.createdAt.toString(),
      type: 'Follow',
    });
  });

  test('creates and cancels an approval-required remote request with one Follow and Undo', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
      handle: 'approval-required',
      instanceId: remoteInstance.id,
    });
    await createRemoteActor(remote.id, remoteInstance.domain);
    const requests: Request[] = [];
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push(request.clone());
        return new Response(null, { status: 202 });
      },
    );

    let profileFollowRequest: typeof ProfileFollowRequests.$inferSelect;
    try {
      const follow = () =>
        requestGraphQL<{
          followProfile: {
            followeeProfile: { followersCount: number };
            followerProfile: { followingCount: number };
            result: { __typename: string; id: string };
          };
        }>(
          `mutation FollowApprovalRequiredRemote($id: ID!) {
            followProfile(input: { id: $id }) {
              followeeProfile { followersCount }
              followerProfile { followingCount }
              result { __typename ... on ProfileFollowRequest { id } }
            }
          }`,
          { id: globalId('Profile', remote.id) },
          auth.token,
        );
      const [first, duplicate] = await Promise.all([follow(), follow()]);
      assertNoGraphQLErrors(first);
      assertNoGraphQLErrors(duplicate);
      assert.deepEqual(duplicate.data?.followProfile.result, first.data?.followProfile.result);
      assert.equal(first.data?.followProfile.result.__typename, 'ProfileFollowRequest');
      assert.equal(first.data?.followProfile.followeeProfile.followersCount, 0);
      assert.equal(first.data?.followProfile.followerProfile.followingCount, 0);

      profileFollowRequest = await db
        .select()
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, auth.profile.id),
            eq(ProfileFollowRequests.followeeProfileId, remote.id),
          ),
        )
        .limit(1)
        .then(firstOrThrow);

      const cancel = () =>
        requestGraphQL(
          `mutation CancelApprovalRequiredRemote($id: ID!) {
            cancelProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
          }`,
          { id: globalId('ProfileFollowRequest', profileFollowRequest.id) },
          auth.token,
        );
      const canceled = await Promise.all([cancel(), cancel()]);
      assert.equal(canceled.filter(({ errors }) => !errors).length, 1);
      assert.equal(canceled.filter(({ errors }) => errors).length, 1);
    } finally {
      fetchMock.mock.restore();
    }

    assert.equal(await countRows(ProfileFollows), 0);
    assert.equal(await countRows(ProfileFollowRequests), 0);
    assert.equal(requests.length, 2);

    const [follow, undo] = await Promise.all(
      requests.map(async (request) => (await request.json()) as Record<string, unknown>),
    );
    const actorUri = `${publicOrigin}/ap/actor/${auth.profile.id}`;
    const remoteActorUri = `https://${remoteInstance.domain}/users/remote`;
    const followUri = `${publicOrigin}/ap/follow/${profileFollowRequest.id}`;
    assert.equal(follow?.type, 'Follow');
    assert.equal(follow?.actor, actorUri);
    assert.equal(follow?.id, followUri);
    assert.equal(follow?.object, remoteActorUri);
    assert.equal(follow?.published, profileFollowRequest.createdAt.toString());
    assert.equal(follow?.to, remoteActorUri);
    assert.equal(undo?.type, 'Undo');
    assert.equal(undo?.actor, actorUri);
    assert.deepEqual(undo?.object, {
      actor: actorUri,
      id: followUri,
      object: remoteActorUri,
      published: profileFollowRequest.createdAt.toString(),
      type: 'Follow',
    });
  });

  test('rejects following a suspended remote profile without creating a relation', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance({ state: InstanceState.SUSPENDED });
    const remote = await createProfile({
      handle: 'suspended-follow',
      instanceId: remoteInstance.id,
    });
    await createRemoteActor(remote.id, remoteInstance.domain);

    const result = await requestGraphQL(
      `mutation FollowSuspendedRemote($id: ID!) {
        followProfile(input: { id: $id }) { result { __typename } }
      }`,
      { id: globalId('Profile', remote.id) },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'NOT_FOUND');
    assert.equal(await countRows(ProfileFollows), 0);
  });

  test('returns a pending union result and approves it into a relationship', async () => {
    const followerAuth = await createAuthenticatedSession();
    const openFolloweeAuth = await createAuthenticatedSession();
    const established = await requestGraphQL<{
      followProfile: { result: { __typename: string; id: string } };
    }>(
      `mutation FollowOpenProfile($id: ID!) {
        followProfile(input: { id: $id }) {
          result {
            __typename
            ... on ProfileFollow { id }
            ... on ProfileFollowRequest { id }
          }
        }
      }`,
      { id: globalId('Profile', openFolloweeAuth.profile.id) },
      followerAuth.token,
    );
    assertNoGraphQLErrors(established);
    assert.equal(established.data?.followProfile.result.__typename, 'ProfileFollow');
    const establishedAgain = await requestGraphQL<{
      followProfile: { result: { __typename: string; id: string } };
    }>(
      `mutation FollowOpenProfileAgain($id: ID!) {
        followProfile(input: { id: $id }) {
          result { __typename ... on ProfileFollow { id } }
        }
      }`,
      { id: globalId('Profile', openFolloweeAuth.profile.id) },
      followerAuth.token,
    );
    assertNoGraphQLErrors(establishedAgain);
    assert.deepEqual(
      establishedAgain.data?.followProfile.result,
      established.data?.followProfile.result,
    );

    const followeeAuth = await createAuthenticatedSession();
    await db
      .update(Profiles)
      .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
      .where(eq(Profiles.id, followeeAuth.profile.id));

    const followed = await requestGraphQL<{
      followProfile: {
        followeeProfile: { id: string };
        followerProfile: { id: string };
        result: { __typename: string; id: string };
      };
    }>(
      `mutation RequestFollow($id: ID!) {
        followProfile(input: { id: $id }) {
          followeeProfile { id }
          followerProfile { id }
          result {
            __typename
            ... on ProfileFollow { id }
            ... on ProfileFollowRequest { id }
          }
        }
      }`,
      { id: globalId('Profile', followeeAuth.profile.id) },
      followerAuth.token,
    );
    assertNoGraphQLErrors(followed);
    assert.deepEqual(followed.data?.followProfile, {
      followeeProfile: { id: globalId('Profile', followeeAuth.profile.id) },
      followerProfile: { id: globalId('Profile', followerAuth.profile.id) },
      result: {
        __typename: 'ProfileFollowRequest',
        id: followed.data?.followProfile.result.id,
      },
    });
    assert.equal(await countRows(ProfileFollowRequests), 1);
    assert.equal(await countRows(ProfileFollows), 1);

    const requestId = followed.data!.followProfile.result.id;
    const requestedAgain = await requestGraphQL<{
      followProfile: { result: { __typename: string; id: string } };
    }>(
      `mutation RequestFollowAgain($id: ID!) {
        followProfile(input: { id: $id }) {
          result { __typename ... on ProfileFollowRequest { id } }
        }
      }`,
      { id: globalId('Profile', followeeAuth.profile.id) },
      followerAuth.token,
    );
    assertNoGraphQLErrors(requestedAgain);
    assert.deepEqual(requestedAgain.data?.followProfile.result, {
      __typename: 'ProfileFollowRequest',
      id: requestId,
    });

    const unauthorizedApproval = await requestGraphQL(
      `mutation UnauthorizedApproveFollowRequest($id: ID!) {
        approveProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: requestId },
      followerAuth.token,
    );
    assertGraphQLErrorCode(unauthorizedApproval, 'PERMISSION_DENIED');

    const approved = await requestGraphQL<{
      approveProfileFollowRequest: {
        followeeProfile: { followersCount: number; id: string };
        followerProfile: { followingCount: number; id: string };
        profileFollow: { id: string };
        profileFollowRequestId: string;
      };
    }>(
      `mutation ApproveFollowRequest($id: ID!) {
        approveProfileFollowRequest(input: { id: $id }) {
          followeeProfile { followersCount id }
          followerProfile { followingCount id }
          profileFollow { id }
          profileFollowRequestId
        }
      }`,
      { id: requestId },
      followeeAuth.token,
    );
    assertNoGraphQLErrors(approved);
    assert.deepEqual(approved.data?.approveProfileFollowRequest, {
      followeeProfile: { followersCount: 1, id: globalId('Profile', followeeAuth.profile.id) },
      followerProfile: { followingCount: 2, id: globalId('Profile', followerAuth.profile.id) },
      profileFollow: { id: approved.data?.approveProfileFollowRequest.profileFollow.id },
      profileFollowRequestId: requestId,
    });
    assert.equal(await countRows(ProfileFollowRequests), 0);
    assert.equal(await countRows(ProfileFollows), 2);
  });

  test('rejects and cancels requests with actor-only payloads', async () => {
    const followerAuth = await createAuthenticatedSession();
    const followeeAuth = await createAuthenticatedSession();
    const rejectedRequest = await db
      .insert(ProfileFollowRequests)
      .values({
        followerProfileId: followerAuth.profile.id,
        followeeProfileId: followeeAuth.profile.id,
      })
      .returning()
      .then(firstOrThrow);
    const rejectedRequestId = globalId('ProfileFollowRequest', rejectedRequest.id);

    const unauthorizedRejection = await requestGraphQL(
      `mutation UnauthorizedRejectFollowRequest($id: ID!) {
        rejectProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: rejectedRequestId },
      followerAuth.token,
    );
    assertGraphQLErrorCode(unauthorizedRejection, 'PERMISSION_DENIED');
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, followerAuth.profile.id));

    const rejected = await requestGraphQL<{
      rejectProfileFollowRequest: {
        followeeProfile: { id: string };
        profileFollowRequestId: string;
      };
    }>(
      `mutation RejectFollowRequest($id: ID!) {
        rejectProfileFollowRequest(input: { id: $id }) {
          followeeProfile { id }
          profileFollowRequestId
        }
      }`,
      { id: rejectedRequestId },
      followeeAuth.token,
    );
    assertNoGraphQLErrors(rejected);
    assert.deepEqual(rejected.data?.rejectProfileFollowRequest, {
      followeeProfile: { id: globalId('Profile', followeeAuth.profile.id) },
      profileFollowRequestId: rejectedRequestId,
    });
    const rejectedAgain = await requestGraphQL(
      `mutation RejectFollowRequestAgain($id: ID!) {
        rejectProfileFollowRequest(input: { id: $id }) { profileFollowRequestId }
      }`,
      { id: rejectedRequestId },
      followeeAuth.token,
    );
    assertGraphQLErrorCode(rejectedAgain, 'NOT_FOUND');

    await db
      .update(Profiles)
      .set({ state: ProfileState.ACTIVE })
      .where(eq(Profiles.id, followerAuth.profile.id));

    const cancelledRequest = await db
      .insert(ProfileFollowRequests)
      .values({
        followerProfileId: followerAuth.profile.id,
        followeeProfileId: followeeAuth.profile.id,
      })
      .returning()
      .then(firstOrThrow);
    const cancelledRequestId = globalId('ProfileFollowRequest', cancelledRequest.id);
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, followeeAuth.profile.id));
    const cancelled = await requestGraphQL<{
      cancelProfileFollowRequest: {
        followerProfile: { id: string };
        profileFollowRequestId: string;
      };
    }>(
      `mutation CancelFollowRequest($id: ID!) {
        cancelProfileFollowRequest(input: { id: $id }) {
          followerProfile { id }
          profileFollowRequestId
        }
      }`,
      { id: cancelledRequestId },
      followerAuth.token,
    );
    assertNoGraphQLErrors(cancelled);
    assert.deepEqual(cancelled.data?.cancelProfileFollowRequest, {
      followerProfile: { id: globalId('Profile', followerAuth.profile.id) },
      profileFollowRequestId: cancelledRequestId,
    });
    assert.equal(await countRows(ProfileFollowRequests), 0);
  });

  test('allows unfollowing a visible remote profile without an instance-kind rejection', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance({ state: InstanceState.UNRESPONSIVE });
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await createRemoteActor(remote.id, remoteInstance.domain);
    const follow = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: auth.profile.id, followeeProfileId: remote.id })
      .returning()
      .then(firstOrThrow);

    const result = await requestGraphQL<{
      unfollowProfile: {
        followeeProfile: { followersCount: number; id: string; instance: { kind: string } };
        followerProfile: { followingCount: number; id: string };
        profileFollowId: string;
      };
    }>(
      `mutation UnfollowRemote($id: ID!) {
        unfollowProfile(input: { id: $id }) {
          followeeProfile { followersCount id instance { kind } }
          followerProfile { followingCount id }
          profileFollowId
        }
      }`,
      { id: globalId('Profile', remote.id) },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.unfollowProfile, {
      followeeProfile: {
        followersCount: 0,
        id: globalId('Profile', remote.id),
        instance: { kind: 'ACTIVITYPUB' },
      },
      followerProfile: { followingCount: 0, id: globalId('Profile', auth.profile.id) },
      profileFollowId: globalId('ProfileFollow', follow.id),
    });
    assert.equal(await countRows(ProfileFollows), 0);
  });

  test('rejects unfollowing a suspended remote profile without deleting the relationship', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance({ state: InstanceState.SUSPENDED });
    const remote = await createProfile({
      handle: 'suspended-remote',
      instanceId: remoteInstance.id,
    });
    const follow = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: auth.profile.id, followeeProfileId: remote.id })
      .returning()
      .then(firstOrThrow);
    await db.update(Profiles).set({ followingCount: 1 }).where(eq(Profiles.id, auth.profile.id));
    await db.update(Profiles).set({ followersCount: 1 }).where(eq(Profiles.id, remote.id));

    const result = await requestGraphQL(
      `mutation UnfollowSuspendedRemote($id: ID!) {
        unfollowProfile(input: { id: $id }) { profileFollowId }
      }`,
      { id: globalId('Profile', remote.id) },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'NOT_FOUND');
    const preserved = await db
      .select()
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, follow.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(preserved.id, follow.id);
    assert.equal(await countRows(ProfileFollows), 1);

    const [follower, followee] = await Promise.all([
      db
        .select({ followingCount: Profiles.followingCount })
        .from(Profiles)
        .where(eq(Profiles.id, auth.profile.id))
        .limit(1)
        .then(firstOrThrow),
      db
        .select({ followersCount: Profiles.followersCount })
        .from(Profiles)
        .where(eq(Profiles.id, remote.id))
        .limit(1)
        .then(firstOrThrow),
    ]);
    assert.equal(follower.followingCount, 1);
    assert.equal(followee.followersCount, 1);
  });

  test('rejects unfollowing a suspended remote profile without a relationship', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance({ state: InstanceState.SUSPENDED });
    const remote = await createProfile({
      handle: 'suspended-remote',
      instanceId: remoteInstance.id,
    });
    await db.update(Profiles).set({ followingCount: 2 }).where(eq(Profiles.id, auth.profile.id));
    await db.update(Profiles).set({ followersCount: 3 }).where(eq(Profiles.id, remote.id));

    const result = await requestGraphQL(
      `mutation UnfollowSuspendedRemoteWithoutRelationship($id: ID!) {
        unfollowProfile(input: { id: $id }) { profileFollowId }
      }`,
      { id: globalId('Profile', remote.id) },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'NOT_FOUND');
    assert.equal(await countRows(ProfileFollows), 0);

    const [follower, followee] = await Promise.all([
      db
        .select({ followingCount: Profiles.followingCount })
        .from(Profiles)
        .where(eq(Profiles.id, auth.profile.id))
        .limit(1)
        .then(firstOrThrow),
      db
        .select({ followersCount: Profiles.followersCount })
        .from(Profiles)
        .where(eq(Profiles.id, remote.id))
        .limit(1)
        .then(firstOrThrow),
    ]);
    assert.equal(follower.followingCount, 2);
    assert.equal(followee.followersCount, 3);
  });

  test('allows creating a local profile when only a remote profile has the same handle', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    await createProfile({ handle: 'alice', instanceId: remoteInstance.id });

    const result = await requestGraphQL<{
      createProfile: { profile: { id: string; instance: { kind: string } } } | null;
    }>(
      `mutation CreateLocalDuplicate($handle: String!) {
        createProfile(input: { handle: $handle }) {
          profile { id instance { kind } }
        }
      }`,
      { handle: 'alice' },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.createProfile?.profile.instance.kind, 'LOCAL');

    const created = await db
      .select()
      .from(Profiles)
      .where(and(eq(Profiles.instanceId, localInstanceId), eq(Profiles.normalizedHandle, 'alice')))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(created.instanceId, localInstanceId);

    const ownership = await db
      .select()
      .from(AccountProfiles)
      .where(eq(AccountProfiles.profileId, created.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(ownership.accountId, auth.account.id);
  });

  test('reads a materialized remote Post and its history without the ActivityPub mapping or network', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createStoredActivityPubAuthor({
      domain: 'materialized.example',
      handle: 'materialized',
    });
    const publishedAt = Temporal.Instant.from('2026-07-15T12:00:00Z');
    const receivedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');
    const publishedAtGraphQL = publishedAt.toString({ smallestUnit: 'millisecond' });
    const receivedAtGraphQL = receivedAt.toString({ smallestUnit: 'millisecond' });
    const materialized = await materializeRemotePost({
      actorUri: author.actorUri,
      content: '<p>Hello from ActivityPub</p>',
      objectUri: 'https://materialized.example/notes/1',
      publishedAt,
      receivedAt,
      summary: '<p>Content warning</p>',
      visibility: PostVisibility.PUBLIC,
    });
    const historicalCreatedAt = receivedAt.subtract({ hours: 1 });
    const historical = await db
      .insert(PostContents)
      .values({
        createdAt: historicalCreatedAt,
        document: postContentDocumentFromText('Historical content'),
        postId: materialized.post.id,
      })
      .returning()
      .then(firstOrThrow);
    await db.insert(ProfileFollows).values({
      followerProfileId: auth.profile.id,
      followeeProfileId: author.profile.id,
    });

    const variables = {
      nodeIds: [
        globalId('Post', materialized.post.id),
        globalId('PostContent', materialized.content.id),
        globalId('PostContent', historical.id),
      ],
      profileId: globalId('Profile', author.profile.id),
    };
    const beforeMappingRemoval = await requestRemotePostRead({
      ...variables,
      first: 10,
      token: auth.token,
    });

    assertNoGraphQLErrors(beforeMappingRemoval);
    assert.deepEqual(beforeMappingRemoval.data?.nodes, [
      {
        __typename: 'Post',
        content: {
          bodyText: 'Hello from ActivityPub',
          contentWarning: 'Content warning',
          createdAt: receivedAtGraphQL,
          document: materialized.content.document,
          id: globalId('PostContent', materialized.content.id),
        },
        createdAt: publishedAtGraphQL,
        id: globalId('Post', materialized.post.id),
        visibility: 'PUBLIC',
      },
      {
        __typename: 'PostContent',
        bodyText: 'Hello from ActivityPub',
        contentWarning: 'Content warning',
        createdAt: receivedAtGraphQL,
        document: materialized.content.document,
        id: globalId('PostContent', materialized.content.id),
      },
      {
        __typename: 'PostContent',
        bodyText: 'Historical content',
        contentWarning: null,
        createdAt: historicalCreatedAt.toString({ smallestUnit: 'millisecond' }),
        document: historical.document,
        id: globalId('PostContent', historical.id),
      },
    ]);
    assert.deepEqual(connectionIds(beforeMappingRemoval.data?.profile?.posts), [
      globalId('Post', materialized.post.id),
    ]);
    assert.deepEqual(connectionIds(beforeMappingRemoval.data?.homeTimeline), [
      globalId('Post', materialized.post.id),
    ]);

    await db.delete(ActivityPubPosts).where(eq(ActivityPubPosts.id, materialized.mapping.id));
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('GraphQL remote Post reads must not use the network');
    });
    try {
      const afterMappingRemoval = await requestRemotePostRead({
        ...variables,
        first: 10,
        token: auth.token,
      });

      assertNoGraphQLErrors(afterMappingRemoval);
      assert.deepEqual(afterMappingRemoval.data, beforeMappingRemoval.data);
      assert.equal(fetchMock.mock.calls.length, 0);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('applies the existing parent authorization matrix to materialized remote Posts', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createStoredActivityPubAuthor({
      domain: 'authorization.example',
      handle: 'authorization',
    });
    const publicPost = await materializeRemotePost({
      actorUri: author.actorUri,
      objectUri: 'https://authorization.example/notes/public',
      visibility: PostVisibility.PUBLIC,
    });
    const unlistedPost = await materializeRemotePost({
      actorUri: author.actorUri,
      objectUri: 'https://authorization.example/notes/unlisted',
      visibility: PostVisibility.UNLISTED,
    });
    const historical = await db
      .insert(PostContents)
      .values({
        document: postContentDocumentFromText('Historical authorization content'),
        postId: publicPost.post.id,
      })
      .returning()
      .then(firstOrThrow);
    await db.insert(ProfileFollows).values({
      followerProfileId: auth.profile.id,
      followeeProfileId: author.profile.id,
    });

    const nodeIds = [
      globalId('Post', publicPost.post.id),
      globalId('PostContent', publicPost.content.id),
      globalId('PostContent', historical.id),
      globalId('Post', unlistedPost.post.id),
      globalId('PostContent', unlistedPost.content.id),
    ];
    const read = () =>
      requestRemotePostRead({
        first: 10,
        nodeIds,
        profileId: globalId('Profile', author.profile.id),
        token: auth.token,
      });

    for (const instanceState of [InstanceState.ACTIVE, InstanceState.UNRESPONSIVE]) {
      await db
        .update(Instances)
        .set({ state: instanceState })
        .where(eq(Instances.id, author.instance.id));
      const allowed = await read();
      assertNoGraphQLErrors(allowed);
      assert.deepEqual(
        allowed.data?.nodes.map((node) => node?.__typename),
        ['Post', 'PostContent', 'PostContent', 'Post', 'PostContent'],
      );
      assert.deepEqual(
        new Set(connectionIds(allowed.data?.profile?.posts)),
        new Set([globalId('Post', publicPost.post.id), globalId('Post', unlistedPost.post.id)]),
      );
      assert.deepEqual(
        new Set(connectionIds(allowed.data?.homeTimeline)),
        new Set([globalId('Post', publicPost.post.id), globalId('Post', unlistedPost.post.id)]),
      );
    }

    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, author.instance.id));
    assertRemotePostReadDenied(await read(), nodeIds.length, false);

    await db
      .update(Instances)
      .set({ state: InstanceState.ACTIVE })
      .where(eq(Instances.id, author.instance.id));
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, author.profile.id));
    assertRemotePostReadDenied(await read(), nodeIds.length, false);

    await db
      .update(Profiles)
      .set({ state: ProfileState.ACTIVE })
      .where(eq(Profiles.id, author.profile.id));
    await db
      .update(Posts)
      .set({ state: PostState.DELETED })
      .where(eq(Posts.profileId, author.profile.id));
    assertRemotePostReadDenied(await read(), nodeIds.length, true);
  });

  test('orders and paginates materialized followee Posts while excluding a non-followee', async () => {
    const auth = await createAuthenticatedSession();
    const followee = await createStoredActivityPubAuthor({
      domain: 'followee.example',
      handle: 'followee',
    });
    const nonFollowee = await createStoredActivityPubAuthor({
      domain: 'non-followee.example',
      handle: 'non-followee',
    });
    const followeePosts = await Promise.all(
      ['one', 'two', 'three'].map((suffix) =>
        materializeRemotePost({
          actorUri: followee.actorUri,
          objectUri: `https://followee.example/notes/${suffix}`,
          visibility: PostVisibility.PUBLIC,
        }),
      ),
    );
    const excluded = await materializeRemotePost({
      actorUri: nonFollowee.actorUri,
      objectUri: 'https://non-followee.example/notes/excluded',
      visibility: PostVisibility.PUBLIC,
    });
    await db.insert(ProfileFollows).values({
      followerProfileId: auth.profile.id,
      followeeProfileId: followee.profile.id,
    });

    const expectedIds = followeePosts
      .map(({ post }) => post.id)
      .toSorted((left, right) => (left < right ? 1 : left > right ? -1 : 0))
      .map((id) => globalId('Post', id));
    const firstPage = await requestRemotePostRead({
      first: 2,
      nodeIds: [],
      profileId: globalId('Profile', followee.profile.id),
      token: auth.token,
    });

    assertNoGraphQLErrors(firstPage);
    assert.deepEqual(connectionIds(firstPage.data?.profile?.posts), expectedIds.slice(0, 2));
    assert.deepEqual(connectionIds(firstPage.data?.homeTimeline), expectedIds.slice(0, 2));
    assert.equal(firstPage.data?.profile?.posts.pageInfo.hasNextPage, true);
    assert.equal(firstPage.data?.homeTimeline?.pageInfo.hasNextPage, true);
    assert.ok(firstPage.data?.profile?.posts.pageInfo.endCursor);
    assert.equal(
      firstPage.data?.profile?.posts.pageInfo.endCursor,
      firstPage.data?.homeTimeline?.pageInfo.endCursor,
    );

    const secondPage = await requestRemotePostRead({
      after: firstPage.data?.profile?.posts.pageInfo.endCursor,
      first: 2,
      nodeIds: [],
      profileId: globalId('Profile', followee.profile.id),
      token: auth.token,
    });
    assertNoGraphQLErrors(secondPage);
    assert.deepEqual(connectionIds(secondPage.data?.profile?.posts), expectedIds.slice(2));
    assert.deepEqual(connectionIds(secondPage.data?.homeTimeline), expectedIds.slice(2));
    assert.equal(secondPage.data?.profile?.posts.pageInfo.hasNextPage, false);
    assert.equal(secondPage.data?.homeTimeline?.pageInfo.hasNextPage, false);
    assert.equal(
      [
        ...connectionIds(firstPage.data?.homeTimeline),
        ...connectionIds(secondPage.data?.homeTimeline),
      ].includes(globalId('Post', excluded.post.id)),
      false,
    );
  });

  test('applies Repost candidate eligibility before Profile and Home pagination', async () => {
    const auth = await createAuthenticatedSession();
    const profileAuthor = await createStoredActivityPubAuthor({
      domain: 'repost-list.example',
      handle: 'repost-list',
    });
    const homeAuthor = await createStoredActivityPubAuthor({
      domain: 'home-repost-list.example',
      handle: 'home-repost-list',
    });
    const sourceAuthor = await createStoredActivityPubAuthor({
      domain: 'repost-source.example',
      handle: 'repost-source',
    });
    await db.insert(ProfileFollows).values({
      followerProfileId: auth.profile.id,
      followeeProfileId: homeAuthor.profile.id,
    });

    const ordinarySource = await createContentfulPost({ profileId: sourceAuthor.profile.id });
    const replyParent = await createContentfulPost({ profileId: sourceAuthor.profile.id });
    const replySource = await createContentfulPost({
      profileId: sourceAuthor.profile.id,
      replyParentId: replyParent.id,
    });
    const quoteSource = await createContentfulPost({
      profileId: sourceAuthor.profile.id,
      repostSourceId: ordinarySource.id,
    });
    const replyQuoteSource = await createContentfulPost({ profileId: sourceAuthor.profile.id });
    const unavailableSource = await createContentfulPost({ profileId: sourceAuthor.profile.id });
    await db
      .update(Posts)
      .set({ state: PostState.DELETED })
      .where(eq(Posts.id, unavailableSource.id));

    const ordinaryRepost = await createPost({
      id: '019f8ed0-0000-7000-8000-000000000110',
      profileId: profileAuthor.profile.id,
      repostSourceId: ordinarySource.id,
    });
    const replyRepost = await createPost({
      id: '019f8ed0-0000-7000-8000-000000000111',
      profileId: profileAuthor.profile.id,
      repostSourceId: replySource.id,
    });
    const quoteRepost = await createPost({
      id: '019f8ed0-0000-7000-8000-000000000112',
      profileId: profileAuthor.profile.id,
      repostSourceId: quoteSource.id,
    });
    const unavailableRepost = await createPost({
      id: '019f8ed0-0000-7000-8000-000000000130',
      profileId: profileAuthor.profile.id,
      repostSourceId: unavailableSource.id,
    });
    const retainedQuote = await createContentfulPost({
      id: '019f8ed0-0000-7000-8000-000000000120',
      profileId: profileAuthor.profile.id,
      repostSourceId: unavailableSource.id,
    });
    const excludedReplyQuote = await createContentfulPost({
      id: '019f8ed0-0000-7000-8000-000000000140',
      profileId: profileAuthor.profile.id,
      replyParentId: ordinarySource.id,
      repostSourceId: replyQuoteSource.id,
    });

    const homeRetainedQuote = await createContentfulPost({
      id: '019f8ed0-0000-7000-8000-000000000210',
      profileId: homeAuthor.profile.id,
      repostSourceId: unavailableSource.id,
    });
    const homeEligibleRepost = await createPost({
      id: '019f8ed0-0000-7000-8000-000000000220',
      profileId: homeAuthor.profile.id,
      repostSourceId: ordinarySource.id,
    });
    const homeUnavailableRepost = await createPost({
      id: '019f8ed0-0000-7000-8000-000000000215',
      profileId: homeAuthor.profile.id,
      repostSourceId: unavailableSource.id,
    });

    const profileExpectedIds = [retainedQuote, quoteRepost, replyRepost, ordinaryRepost].map(
      ({ id }) => globalId('Post', id),
    );
    const profileFirstPage = await requestRemotePostRead({
      first: 2,
      nodeIds: [],
      profileId: globalId('Profile', profileAuthor.profile.id),
      token: auth.token,
    });

    assertNoGraphQLErrors(profileFirstPage);
    assert.deepEqual(
      connectionIds(profileFirstPage.data?.profile?.posts),
      profileExpectedIds.slice(0, 2),
    );
    assert.equal(profileFirstPage.data?.profile?.posts.pageInfo.hasNextPage, true);

    const profileSecondPage = await requestRemotePostRead({
      after: profileFirstPage.data?.profile?.posts.pageInfo.endCursor,
      first: 2,
      nodeIds: [],
      profileId: globalId('Profile', profileAuthor.profile.id),
      token: auth.token,
    });

    assertNoGraphQLErrors(profileSecondPage);
    assert.deepEqual(
      connectionIds(profileSecondPage.data?.profile?.posts),
      profileExpectedIds.slice(2),
    );
    assert.equal(profileSecondPage.data?.profile?.posts.pageInfo.hasNextPage, false);
    assert.equal(
      connectionIds(profileSecondPage.data?.profile?.posts).includes(
        globalId('Post', unavailableRepost.id),
      ),
      false,
    );
    assert.equal(
      connectionIds(profileSecondPage.data?.profile?.posts).includes(
        globalId('Post', excludedReplyQuote.id),
      ),
      false,
    );

    const homeFirstPage = await requestRemotePostRead({
      first: 1,
      nodeIds: [],
      profileId: globalId('Profile', homeAuthor.profile.id),
      token: auth.token,
    });

    assertNoGraphQLErrors(homeFirstPage);
    assert.deepEqual(connectionIds(homeFirstPage.data?.homeTimeline), [
      globalId('Post', homeEligibleRepost.id),
    ]);
    assert.equal(homeFirstPage.data?.homeTimeline?.pageInfo.hasNextPage, true);
    assert.ok(homeFirstPage.data?.homeTimeline?.pageInfo.endCursor);

    const homeSecondPage = await requestRemotePostRead({
      after: homeFirstPage.data?.homeTimeline?.pageInfo.endCursor,
      first: 1,
      nodeIds: [],
      profileId: globalId('Profile', homeAuthor.profile.id),
      token: auth.token,
    });

    assertNoGraphQLErrors(homeSecondPage);
    assert.deepEqual(connectionIds(homeSecondPage.data?.homeTimeline), [
      globalId('Post', homeRetainedQuote.id),
    ]);
    assert.equal(homeSecondPage.data?.homeTimeline?.pageInfo.hasNextPage, false);
    assert.equal(
      [
        ...connectionIds(homeFirstPage.data?.homeTimeline),
        ...connectionIds(homeSecondPage.data?.homeTimeline),
      ].includes(globalId('Post', homeUnavailableRepost.id)),
      false,
    );

    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, sourceAuthor.profile.id));

    const disabledSourceHome = await requestRemotePostRead({
      first: 10,
      nodeIds: [globalId('Post', homeEligibleRepost.id), globalId('Post', homeRetainedQuote.id)],
      profileId: globalId('Profile', homeAuthor.profile.id),
      token: auth.token,
    });

    assertNoGraphQLErrors(disabledSourceHome);
    assert.deepEqual(connectionIds(disabledSourceHome.data?.homeTimeline), [
      globalId('Post', homeRetainedQuote.id),
    ]);
    assert.deepEqual(
      disabledSourceHome.data?.nodes.map((node) => node?.id ?? null),
      [null, globalId('Post', homeRetainedQuote.id)],
    );

    const disabledSourceProfile = await requestRemotePostRead({
      first: 10,
      nodeIds: [globalId('Post', ordinaryRepost.id), globalId('Post', retainedQuote.id)],
      profileId: globalId('Profile', profileAuthor.profile.id),
    });

    assertNoGraphQLErrors(disabledSourceProfile);
    assert.deepEqual(connectionIds(disabledSourceProfile.data?.profile?.posts), [
      globalId('Post', retainedQuote.id),
    ]);
    assert.deepEqual(
      disabledSourceProfile.data?.nodes.map((node) => node?.id ?? null),
      [null, globalId('Post', retainedQuote.id)],
    );
    assert.equal(disabledSourceProfile.data?.homeTimeline, null);
  });
});

type GraphQLErrorResult = {
  extensions?: { code?: string };
  message: string;
};

type GraphQLResult<TData = Record<string, unknown>> = {
  data?: TData;
  errors?: GraphQLErrorResult[];
};

type RemotePostNode =
  | {
      __typename: 'Post';
      content: {
        bodyText: string;
        contentWarning: string | null;
        createdAt: string;
        document: unknown;
        id: string;
      } | null;
      createdAt: string;
      id: string;
      visibility: string;
    }
  | {
      __typename: 'PostContent';
      bodyText: string;
      contentWarning: string | null;
      createdAt: string;
      document: unknown;
      id: string;
    }
  | null;

type RemotePostConnection = {
  edges: Array<{ cursor: string; node: { id: string } }>;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
};

type RemotePostReadData = {
  nodes: RemotePostNode[];
  profile: { posts: RemotePostConnection } | null;
  homeTimeline: RemotePostConnection | null;
};

const requestGraphQL = async <TData = Record<string, unknown>>(
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

const requestRemotePostRead = ({
  after,
  first,
  nodeIds,
  profileId,
  token,
}: {
  after?: string | null;
  first: number;
  nodeIds: string[];
  profileId: string;
  token?: string;
}) =>
  requestGraphQL<RemotePostReadData>(
    `query MaterializedRemotePostRead(
      $after: String
      $first: Int!
      $nodeIds: [ID!]!
      $profileId: ID!
    ) {
      nodes(ids: $nodeIds) {
        __typename
        ... on Post {
          id
          createdAt
          visibility
          content {
            id
            document
            bodyText
            contentWarning
            createdAt
          }
        }
        ... on PostContent {
          id
          document
          bodyText
          contentWarning
          createdAt
        }
      }
      profile: node(id: $profileId) {
        ... on Profile {
          posts(first: $first, after: $after) {
            edges { cursor node { id } }
            pageInfo { endCursor hasNextPage }
          }
        }
      }
      homeTimeline(first: $first, after: $after) {
        edges { cursor node { id } }
        pageInfo { endCursor hasNextPage }
      }
    }`,
    { after: after ?? null, first, nodeIds, profileId },
    token,
  );

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const assertGraphQLErrorCode = (result: GraphQLResult<unknown>, code: string) => {
  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.extensions?.code, code, JSON.stringify(result.errors));
};

const connectionIds = (connection: RemotePostConnection | null | undefined) =>
  connection?.edges.map(({ node }) => node.id) ?? [];

const assertRemotePostReadDenied = (
  result: GraphQLResult<RemotePostReadData>,
  nodeCount: number,
  profileVisible: boolean,
) => {
  assertNoGraphQLErrors(result);
  assert.deepEqual(
    result.data?.nodes,
    Array.from({ length: nodeCount }, () => null),
  );
  if (profileVisible) {
    assert.ok(result.data?.profile);
    assert.deepEqual(connectionIds(result.data.profile.posts), []);
  } else {
    assert.equal(result.data?.profile, null);
  }
  assert.deepEqual(connectionIds(result.data?.homeTimeline), []);
};

const createRemoteInstance = async ({
  domain = remoteDomain,
  state = InstanceState.ACTIVE,
}: {
  domain?: string;
  state?: InstanceState;
} = {}) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state,
    })
    .returning()
    .then(firstOrThrow);

const createLocalInstance = async ({
  domain,
  state = InstanceState.ACTIVE,
}: {
  domain: string;
  state?: InstanceState;
}) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.LOCAL,
      state,
    })
    .returning()
    .then(firstOrThrow);

const createProfile = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  followersCount,
  followingCount,
  handle,
  id,
  instanceId,
  state = ProfileState.ACTIVE,
}: {
  followPolicy?: ProfileFollowPolicy;
  followersCount?: number;
  followingCount?: number;
  handle: string;
  id?: string;
  instanceId: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy,
      ...(followersCount === undefined ? {} : { followersCount }),
      ...(followingCount === undefined ? {} : { followingCount }),
      handle,
      ...(id === undefined ? {} : { id }),
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createStoredActivityPubAuthor = async ({
  domain,
  handle,
}: {
  domain: string;
  handle: string;
}) => {
  const instance = await createRemoteInstance({ domain });
  const profile = await createProfile({ handle, instanceId: instance.id });
  const actorUri = `https://${domain}/users/${handle}`;
  await db.insert(ActivityPubActors).values({
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });

  return { actorUri, instance, profile };
};

const materializeRemotePost = async ({
  actorUri,
  content = '<p>Materialized content</p>',
  objectUri,
  publishedAt = null,
  receivedAt = Temporal.Instant.from('2026-07-16T00:00:00Z'),
  summary = null,
  visibility,
}: {
  actorUri: string;
  content?: string;
  objectUri: string;
  publishedAt?: Temporal.Instant | null;
  receivedAt?: Temporal.Instant;
  summary?: string | null;
  visibility: typeof PostVisibility.PUBLIC | typeof PostVisibility.UNLISTED;
}) => {
  const note = new Note({
    attribution: new URL(actorUri),
    ...(visibility === PostVisibility.PUBLIC
      ? { to: PUBLIC_COLLECTION }
      : { cc: PUBLIC_COLLECTION }),
    content,
    id: new URL(objectUri),
    mediaType: 'text/html',
    published: publishedAt,
    summary,
  });
  const documentLoader = mock.fn(async () => {
    throw new Error('Embedded Note materialization must not fetch');
  });

  await handleInboundCreate(
    { documentLoader } as unknown as Parameters<typeof handleInboundCreate>[0],
    new Create({ actor: new URL(actorUri), object: note }),
    receivedAt,
  );
  assert.equal(documentLoader.mock.calls.length, 0);

  const mapping = await db
    .select()
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, objectUri))
    .then(firstOrThrow);
  const post = await db.select().from(Posts).where(eq(Posts.id, mapping.postId)).then(firstOrThrow);
  assert.ok(post.currentContentId);
  const materializedContent = await db
    .select()
    .from(PostContents)
    .where(eq(PostContents.id, post.currentContentId))
    .then(firstOrThrow);

  return { content: materializedContent, mapping, post };
};

const createPost = async ({
  id,
  profileId,
  repostSourceId,
}: {
  id?: string;
  profileId: string;
  repostSourceId: string;
}) =>
  db
    .insert(Posts)
    .values({
      ...(id === undefined ? {} : { id }),
      profileId,
      repostSourceId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);

const createContentfulPost = async ({
  id,
  profileId,
  replyParentId,
  repostSourceId,
}: {
  id?: string;
  profileId: string;
  replyParentId?: string;
  repostSourceId?: string;
}) => {
  const post = await db
    .insert(Posts)
    .values({
      ...(id === undefined ? {} : { id }),
      profileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText('content'), postId: post.id })
    .returning()
    .then(firstOrThrow);

  return db
    .update(Posts)
    .set({
      currentContentId: content.id,
      ...(replyParentId === undefined ? {} : { replyParentId }),
      ...(repostSourceId === undefined ? {} : { repostSourceId }),
    })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const createRemoteActor = (
  profileId: string,
  domain: string,
  { withInbox = true }: { withInbox?: boolean } = {},
) =>
  db.insert(ActivityPubActors).values({
    inboxUri: withInbox ? `https://${domain}/users/remote/inbox` : null,
    profileId,
    sharedInboxUri: `https://${domain}/inbox`,
    type: 'PERSON',
    uri: `https://${domain}/users/remote`,
  });

const createAuthenticatedSession = async () => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Test Account',
      oidcSubject: `subject-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile({
    handle: `viewer-${crypto.randomUUID().slice(0, 8)}`,
    instanceId: localInstanceId,
  });
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const token = `token-${crypto.randomUUID()}`;
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: profile.id,
      state: SessionState.ACTIVE,
      token,
    })
    .returning()
    .then(firstOrThrow);

  return { account, profile, session, token };
};

const countRows = async (
  table: typeof Instances | typeof Profiles | typeof ProfileFollows | typeof ProfileFollowRequests,
): Promise<number> =>
  db
    .select({ value: count() })
    .from(table)
    .then(firstOrThrow)
    .then((row) => row.value);

const resetFixtures = async () => {
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(Sessions);
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(ProfileFollowRequests);
  await db.delete(ProfileFollows);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db.delete(Instances).where(eq(Instances.kind, InstanceKind.ACTIVITYPUB));
  await db
    .delete(Instances)
    .where(and(eq(Instances.kind, InstanceKind.LOCAL), ne(Instances.id, localInstanceId)));
};

const truncateDatabase = async () => {
  assertTestDatabaseUrl();

  await pg.unsafe(`
    DO $$
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement;
      END IF;
    END $$;
  `);
};

const assertTestDatabaseUrl = () => {
  assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, '/kosmo_test');
};
