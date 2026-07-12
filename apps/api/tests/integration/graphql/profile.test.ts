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
import { isConfiguredLocalProfile } from '@kosmo/core/profile';
import { normalizeHandle } from '@kosmo/core/utils';
import { count, eq } from 'drizzle-orm';
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

    for (const [handle, id, origin, relativeHandle] of cases) {
      const result = await requestGraphQL<{
        profileByHandle: {
          id: string;
          origin: string;
          relativeHandle: string;
        } | null;
      }>(
        `query ProfileByHandle($handle: String!) {
          profileByHandle(handle: $handle) {
            id
            origin
            relativeHandle
          }
        }`,
        { handle },
      );

      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.profileByHandle, { id, origin, relativeHandle });
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
        origin: string;
        relativeHandle: string;
      } | null;
    }>(
      `query RemoteNode($id: ID!) {
        node(id: $id) {
          __typename
          ... on Profile {
            id
            origin
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
      origin: 'ACTIVITYPUB',
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
      node: { origin: string } | null;
    }>(
      `query OtherLocalProfileOrigin($id: ID!) {
        node(id: $id) {
          ... on Profile { origin }
        }
      }`,
      { id: profile.id },
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.origin, 'LOCAL');
  });

  test('hides remote follow graph data even when cross-instance rows exist', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });

    await db.insert(ProfileFollows).values([
      { followerProfileId: auth.profile.id, followeeProfileId: remote.id },
      { followerProfileId: remote.id, followeeProfileId: auth.profile.id },
    ]);

    const result = await requestGraphQL<{
      profileByHandle: {
        followers: { edges: unknown[] };
        followersCount: number;
        following: { edges: unknown[] };
        followingCount: number;
        viewerFollow: unknown | null;
        viewerState: { follow: unknown | null; isSelf: boolean } | null;
      } | null;
    }>(
      `query RemoteFollowGraph($handle: String!) {
        profileByHandle(handle: $handle) {
          followers(first: 10) { edges { node { id } } }
          followersCount
          following(first: 10) { edges { node { id } } }
          followingCount
          viewerFollow { id }
          viewerState { isSelf follow { id } }
        }
      }`,
      { handle: `remote@${remoteDomain}` },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle, {
      followers: { edges: [] },
      followersCount: 0,
      following: { edges: [] },
      followingCount: 0,
      viewerFollow: null,
      viewerState: { follow: null, isSelf: false },
    });
  });

  test('hides remote posts even when post rows exist', async () => {
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await db.insert(Posts).values({
      profileId: remote.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    });

    const result = await requestGraphQL<{
      profileByHandle: { posts: { edges: unknown[] } } | null;
    }>(
      `query RemotePosts($handle: String!) {
        profileByHandle(handle: $handle) {
          posts(first: 10) { edges { node { id } } }
        }
      }`,
      { handle: `remote@${remoteDomain}` },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle?.posts, { edges: [] });
  });

  test('hides remote and suspended-instance posts from Node and home timeline', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    const suspendedInstance = await createRemoteInstance({
      domain: 'suspended.example',
      state: InstanceState.SUSPENDED,
    });
    const suspended = await createProfile({
      handle: 'suspended',
      instanceId: suspendedInstance.id,
    });
    const [remotePost, suspendedPost] = await db
      .insert(Posts)
      .values([
        {
          profileId: remote.id,
          state: PostState.ACTIVE,
          visibility: PostVisibility.PUBLIC,
        },
        {
          profileId: suspended.id,
          state: PostState.ACTIVE,
          visibility: PostVisibility.PUBLIC,
        },
      ])
      .returning();
    await db.insert(ProfileFollows).values([
      { followerProfileId: auth.profile.id, followeeProfileId: remote.id },
      { followerProfileId: auth.profile.id, followeeProfileId: suspended.id },
    ]);

    const result = await requestGraphQL<{
      remotePost: { id: string } | null;
      suspendedPost: { id: string } | null;
      homeTimeline: { edges: unknown[] } | null;
    }>(
      `query HiddenForeignPosts($remotePostId: ID!, $suspendedPostId: ID!) {
        remotePost: node(id: $remotePostId) {
          ... on Post { id }
        }
        suspendedPost: node(id: $suspendedPostId) {
          ... on Post { id }
        }
        homeTimeline(first: 10) { edges { node { id } } }
      }`,
      { remotePostId: remotePost.id, suspendedPostId: suspendedPost.id },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      remotePost: null,
      suspendedPost: null,
      homeTimeline: { edges: [] },
    });
  });

  test('hides remote and suspended-instance post contents from Node', async () => {
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    const suspendedInstance = await createRemoteInstance({
      domain: 'suspended.example',
      state: InstanceState.SUSPENDED,
    });
    const suspended = await createProfile({
      handle: 'suspended',
      instanceId: suspendedInstance.id,
    });
    const [remotePost, suspendedPost] = await db
      .insert(Posts)
      .values([
        {
          profileId: remote.id,
          state: PostState.ACTIVE,
          visibility: PostVisibility.PUBLIC,
        },
        {
          profileId: suspended.id,
          state: PostState.ACTIVE,
          visibility: PostVisibility.PUBLIC,
        },
      ])
      .returning();
    const [remoteContent, suspendedContent] = await db
      .insert(PostContents)
      .values([
        {
          bodyText: 'remote content',
          postId: remotePost.id,
        },
        {
          bodyText: 'suspended content',
          postId: suspendedPost.id,
        },
      ])
      .returning();

    const result = await requestGraphQL<{
      remoteContent: { id: string } | null;
      suspendedContent: { id: string } | null;
    }>(
      `query HiddenForeignPostContents($remoteContentId: ID!, $suspendedContentId: ID!) {
        remoteContent: node(id: $remoteContentId) {
          ... on PostContent { id }
        }
        suspendedContent: node(id: $suspendedContentId) {
          ... on PostContent { id }
        }
      }`,
      { remoteContentId: remoteContent.id, suspendedContentId: suspendedContent.id },
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data, {
      remoteContent: null,
      suspendedContent: null,
    });
  });

  test('rejects selecting a remote profile even when the account owns it', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: remote.id,
      role: AccountProfileRole.OWNER,
    });

    const result = await requestGraphQL(
      `mutation SelectRemote($id: ID!) {
        selectProfile(input: { id: $id }) { profile { id } }
      }`,
      { id: remote.id },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'NOT_FOUND');
    const session = await db
      .select()
      .from(Sessions)
      .where(eq(Sessions.id, auth.session.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(session.activeProfileId, auth.profile.id);
  });

  test('rejects updating a remote profile even when the account owns it', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: remote.id,
      role: AccountProfileRole.OWNER,
    });

    const result = await requestGraphQL(
      `mutation UpdateRemote($id: ID!) {
        updateProfile(input: { id: $id, displayName: "overwritten" }) { profile { id } }
      }`,
      { id: remote.id },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'NOT_FOUND');
    const preserved = await db
      .select()
      .from(Profiles)
      .where(eq(Profiles.id, remote.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(preserved.displayName, remote.displayName);
    assert.equal(preserved.bio, remote.bio);
    assert.equal(preserved.followPolicy, remote.followPolicy);
  });

  test('rejects deleting a remote profile even when the account owns it', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: remote.id,
      role: AccountProfileRole.OWNER,
    });

    const result = await requestGraphQL(
      `mutation DeleteRemote($id: ID!) {
        deleteProfile(input: { id: $id }) { profileId }
      }`,
      { id: remote.id },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'NOT_FOUND');
    const preserved = await db
      .select()
      .from(Profiles)
      .where(eq(Profiles.id, remote.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(preserved.state, ProfileState.ACTIVE);
  });

  test('hides remote profiles from an account profile list', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: remote.id,
      role: AccountProfileRole.OWNER,
    });
    await db
      .update(Sessions)
      .set({ activeProfileId: remote.id })
      .where(eq(Sessions.id, auth.session.id));

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
    assert.deepEqual(result.data?.me?.profiles, [{ id: auth.profile.id }]);
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

  test('rejects unfollowing a remote profile without deleting an existing row', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    const follow = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: auth.profile.id, followeeProfileId: remote.id })
      .returning()
      .then(firstOrThrow);

    const result = await requestGraphQL(
      `mutation UnfollowRemote($id: ID!) {
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
      createProfile: { profile: { id: string; origin: string } } | null;
    }>(
      `mutation CreateLocalDuplicate($handle: String!) {
        createProfile(input: { handle: $handle }) {
          profile { id origin }
        }
      }`,
      { handle: 'alice' },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.createProfile?.profile.origin, 'LOCAL');

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

  test('does not authorize a remote profile stored in an existing session', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: remote.id,
      role: AccountProfileRole.OWNER,
    });
    await db
      .update(Sessions)
      .set({ activeProfileId: remote.id })
      .where(eq(Sessions.id, auth.session.id));

    const result = await requestGraphQL(
      `mutation CreatePostWithRemoteSession($bodyText: String!) {
        createPost(input: { bodyText: $bodyText, visibility: UNLISTED }) { post { id } }
      }`,
      { bodyText: 'blocked' },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'PERMISSION_DENIED');
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
  await db.delete(Sessions);
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(ProfileFollows);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db.delete(Instances).where(eq(Instances.kind, InstanceKind.ACTIVITYPUB));
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
