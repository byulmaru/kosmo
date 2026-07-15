import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
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
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const localDomain = '127.0.0.1:4173';
const remoteDomain = 'remote.example';
const databaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
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
      db,
      firstOrThrow,
      Instances,
      pg,
      ProfileFollows,
      Profiles,
      PostContents,
      Posts,
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
        id,
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
    const remote = await createProfile({ handle: 'alice', instanceId: remoteInstance.id });

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
      { id: remote.id },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      __typename: 'Profile',
      id: remote.id,
      instance: { kind: 'ACTIVITYPUB' },
      relativeHandle: `@alice@${remoteDomain}`,
    });
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
      { id: profile.id },
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.instance.kind, 'LOCAL');
  });

  test('reads follow graph data for active profiles on another local instance', async () => {
    const auth = await createAuthenticatedSession();
    const otherLocalInstance = await createLocalInstance({ domain: 'other-local.example' });
    const otherLocal = await createProfile({
      handle: 'other-local',
      instanceId: otherLocalInstance.id,
    });

    await db.insert(ProfileFollows).values([
      { followerProfileId: auth.profile.id, followeeProfileId: otherLocal.id },
      { followerProfileId: otherLocal.id, followeeProfileId: auth.profile.id },
    ]);

    const result = await requestGraphQL<{
      node: {
        followers: { edges: Array<{ node: { id: string } }> };
        following: { edges: Array<{ node: { id: string } }> };
        viewerFollow: { id: string } | null;
        viewerState: { follow: { id: string } | null; isSelf: boolean } | null;
      } | null;
    }>(
      `query OtherLocalFollowGraph($id: ID!) {
        node(id: $id) {
          ... on Profile {
            followers(first: 10) { edges { node { id } } }
            following(first: 10) { edges { node { id } } }
            viewerFollow { id }
            viewerState { isSelf follow { id } }
          }
        }
      }`,
      { id: otherLocal.id },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.followers.edges.length, 1);
    assert.equal(result.data?.node?.following.edges.length, 1);
    assert.equal(
      result.data?.node?.viewerFollow?.id,
      result.data?.node?.followers.edges[0]?.node.id,
    );
    assert.deepEqual(result.data?.node?.viewerState, {
      follow: result.data?.node?.viewerFollow,
      isSelf: false,
    });
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
      { postId: post.id, profileId: otherLocal.id },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      post: { id: post.id },
      node: { posts: { edges: [{ node: { id: post.id } }] } },
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
      { postId: post.id, profileId: remote.id },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      post: { id: post.id },
      node: { posts: { edges: [{ node: { id: post.id } }] } },
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
      { suspendedPostId: suspendedPost.id },
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
      { suspendedContentId: suspendedContent.id },
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
    assert.deepEqual(result.data?.me?.profiles, [{ id: auth.profile.id }, { id: otherLocal.id }]);
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
      { id: remote.id },
      auth.token,
    );

    assertNoGraphQLErrors(selected);
    assert.deepEqual(selected.data?.selectProfile, {
      profile: { id: remote.id, instance: { kind: 'ACTIVITYPUB' } },
      session: { selectedProfile: { id: remote.id, instance: { kind: 'ACTIVITYPUB' } } },
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
      id: remote.id,
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
        { id },
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
      { id: remote.id },
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
      { id: remote.id },
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

  test('rejects following a remote profile without creating a relationship', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });

    const result = await requestGraphQL(
      `mutation FollowRemote($id: ID!) {
        followProfile(input: { id: $id }) { profileFollow { id } }
      }`,
      { id: remote.id },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'NOT_FOUND');
    assert.equal(await countRows(ProfileFollows), 0);
  });

  test('allows unfollowing a visible remote profile without an instance-kind rejection', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
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
      { id: remote.id },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.unfollowProfile, {
      followeeProfile: {
        followersCount: 0,
        id: remote.id,
        instance: { kind: 'ACTIVITYPUB' },
      },
      followerProfile: { followingCount: 0, id: auth.profile.id },
      profileFollowId: follow.id,
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

    const result = await requestGraphQL(
      `mutation UnfollowSuspendedRemote($id: ID!) {
        unfollowProfile(input: { id: $id }) { profileFollowId }
      }`,
      { id: remote.id },
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
      .where(eq(Profiles.id, result.data!.createProfile!.profile.id))
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
});

type GraphQLErrorResult = {
  extensions?: { code?: string };
  message: string;
};

type GraphQLResult<TData = Record<string, unknown>> = {
  data?: TData;
  errors?: GraphQLErrorResult[];
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

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const assertGraphQLErrorCode = (result: GraphQLResult<unknown>, code: string) => {
  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.extensions?.code, code, JSON.stringify(result.errors));
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

const createProfile = async ({ handle, instanceId }: { handle: string; instanceId: string }) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

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

const countRows = async (table: typeof Profiles | typeof ProfileFollows): Promise<number> =>
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
