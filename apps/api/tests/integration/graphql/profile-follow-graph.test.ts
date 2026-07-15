import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, asc, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const remoteDomain = 'remote.example';
const databaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL profile follow graph', () => {
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
      ProfileFollowRequests,
      Profiles,
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

  test('reads established relationships for an active profile on another local instance', async () => {
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

    const result = await requestNodeFollowGraph(otherLocal.id, auth.token);

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

  test('returns self viewer state without a follow relationship', async () => {
    const auth = await createAuthenticatedSession();

    const result = await requestNodeFollowGraph(auth.profile.id, auth.token);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      followers: { edges: [] },
      following: { edges: [] },
      viewerFollow: null,
      viewerState: { follow: null, isSelf: true },
    });
  });

  test('does not expose pending requests as local follow relationships', async () => {
    const auth = await createAuthenticatedSession();
    const otherLocalInstance = await createLocalInstance({ domain: 'pending-local.example' });
    const otherLocal = await createProfile({
      handle: 'pending-local',
      instanceId: otherLocalInstance.id,
    });
    await db.insert(ProfileFollowRequests).values([
      { followerProfileId: auth.profile.id, followeeProfileId: otherLocal.id },
      { followerProfileId: otherLocal.id, followeeProfileId: auth.profile.id },
    ]);

    const result = await requestNodeFollowGraph(otherLocal.id, auth.token);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      followers: { edges: [] },
      following: { edges: [] },
      viewerFollow: null,
      viewerState: { follow: null, isSelf: false },
    });
  });

  test('reads visible established relationships and stored counts for a remote profile', async () => {
    const remoteInstance = await createRemoteInstance();
    const counterpartInstance = await createRemoteInstance({
      domain: 'unresponsive-counterpart.example',
      state: InstanceState.UNRESPONSIVE,
    });
    const remote = await createProfile({
      followersCount: 41,
      followingCount: 43,
      handle: 'remote-follow-graph',
      instanceId: remoteInstance.id,
    });
    const publicFollower = await createProfile({
      handle: 'public-follower',
      instanceId: counterpartInstance.id,
    });
    const publicFollowee = await createProfile({
      handle: 'public-followee',
      instanceId: counterpartInstance.id,
    });
    const [followerFollow, followingFollow] = await db
      .insert(ProfileFollows)
      .values([
        { followerProfileId: publicFollower.id, followeeProfileId: remote.id },
        { followerProfileId: remote.id, followeeProfileId: publicFollowee.id },
      ])
      .returning();

    const result = await requestFollowGraph(`remote-follow-graph@${remoteDomain}`);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle, {
      followers: {
        edges: [
          {
            node: {
              followee: { id: globalId('Profile', remote.id) },
              follower: { id: globalId('Profile', publicFollower.id) },
              id: globalId('ProfileFollow', followerFollow!.id),
            },
          },
        ],
      },
      followersCount: 41,
      following: {
        edges: [
          {
            node: {
              followee: { id: globalId('Profile', publicFollowee.id) },
              follower: { id: globalId('Profile', remote.id) },
              id: globalId('ProfileFollow', followingFollow!.id),
            },
          },
        ],
      },
      followingCount: 43,
      viewerFollow: null,
      viewerState: null,
    });
  });

  test("shows the viewer's own approval-required relationships", async () => {
    const auth = await createAuthenticatedSession();
    await db
      .update(Profiles)
      .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
      .where(eq(Profiles.id, auth.profile.id));
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
      handle: 'viewer-private-follow-graph',
      instanceId: remoteInstance.id,
    });
    const [viewerFollow, reverseViewerFollow] = await db
      .insert(ProfileFollows)
      .values([
        { followerProfileId: auth.profile.id, followeeProfileId: remote.id },
        { followerProfileId: remote.id, followeeProfileId: auth.profile.id },
      ])
      .returning();

    const result = await requestFollowGraph(
      `viewer-private-follow-graph@${remoteDomain}`,
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle, {
      followers: {
        edges: [
          {
            node: {
              followee: { id: globalId('Profile', remote.id) },
              follower: { id: globalId('Profile', auth.profile.id) },
              id: globalId('ProfileFollow', viewerFollow!.id),
            },
          },
        ],
      },
      followersCount: 0,
      following: {
        edges: [
          {
            node: {
              followee: { id: globalId('Profile', auth.profile.id) },
              follower: { id: globalId('Profile', remote.id) },
              id: globalId('ProfileFollow', reverseViewerFollow!.id),
            },
          },
        ],
      },
      followingCount: 0,
      viewerFollow: { id: globalId('ProfileFollow', viewerFollow!.id) },
      viewerState: {
        follow: { id: globalId('ProfileFollow', viewerFollow!.id) },
        isSelf: false,
      },
    });
  });

  test('excludes approval-required relationships from a remote follow graph', async () => {
    await assertRemoteFollowGraphHidesCounterparts({
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    });
  });

  test('excludes inactive profile relationships from a remote follow graph', async () => {
    await assertRemoteFollowGraphHidesCounterparts({ profileState: ProfileState.DISABLED });
  });

  test('excludes suspended instance relationships from a remote follow graph', async () => {
    await assertRemoteFollowGraphHidesCounterparts({
      instanceState: InstanceState.SUSPENDED,
    });
  });

  test('does not return viewer follow for a reverse-only relationship', async () => {
    const { result } = await requestViewerFollowScenario('reverse');

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.profileByHandle?.viewerFollow, null);
    assert.deepEqual(result.data?.profileByHandle?.viewerState, {
      follow: null,
      isSelf: false,
    });
  });

  test('returns no viewer state for a session without an active profile', async () => {
    const auth = await createAuthenticatedSession({ activeProfile: false });
    const remoteInstance = await createRemoteInstance();
    await createProfile({
      handle: 'no-active-profile-target',
      instanceId: remoteInstance.id,
    });

    const result = await requestFollowGraph(`no-active-profile-target@${remoteDomain}`, auth.token);

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.profileByHandle?.viewerFollow, null);
    assert.equal(result.data?.profileByHandle?.viewerState, null);
  });

  test('does not expose pending requests as remote follow relationships', async () => {
    const { result } = await requestViewerFollowScenario('pending', {
      followersCount: 47,
      followingCount: 53,
    });

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.profileByHandle, {
      followers: { edges: [] },
      followersCount: 47,
      following: { edges: [] },
      followingCount: 53,
      viewerFollow: null,
      viewerState: { follow: null, isSelf: false },
    });
  });

  test('reads a remote follow graph without network or database writes', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({
      followersCount: 61,
      followingCount: 67,
      handle: 'read-only-remote-follow-graph',
      instanceId: remoteInstance.id,
    });
    const pendingFollower = await createProfile({
      handle: 'pending-follower',
      instanceId: localInstanceId,
    });
    await db
      .insert(ProfileFollows)
      .values({ followerProfileId: auth.profile.id, followeeProfileId: remote.id });
    await db
      .insert(ProfileFollowRequests)
      .values({ followerProfileId: pendingFollower.id, followeeProfileId: remote.id });

    const readFollowGraphState = async () =>
      JSON.stringify({
        instances: await db.select().from(Instances).orderBy(asc(Instances.id)),
        profiles: await db.select().from(Profiles).orderBy(asc(Profiles.id)),
        follows: await db.select().from(ProfileFollows).orderBy(asc(ProfileFollows.id)),
        requests: await db
          .select()
          .from(ProfileFollowRequests)
          .orderBy(asc(ProfileFollowRequests.id)),
      });
    const stateBefore = await readFollowGraphState();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('Remote follow graph reads must not fetch remote collections.');
    }) as typeof fetch;

    let result: GraphQLResult<FollowGraph>;

    try {
      result = await requestFollowGraph(
        `read-only-remote-follow-graph@${remoteDomain}`,
        auth.token,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assertNoGraphQLErrors(result!);
    assert.ok(result!.data?.profileByHandle?.viewerFollow);
    assert.equal(await readFollowGraphState(), stateBefore);
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

type FollowGraphProfile = {
  followers: { edges: Array<{ node: ProfileFollowNode }> };
  followersCount: number;
  following: { edges: Array<{ node: ProfileFollowNode }> };
  followingCount: number;
  viewerFollow: { id: string } | null;
  viewerState: { follow: { id: string } | null; isSelf: boolean } | null;
};

type ProfileFollowNode = {
  followee: { id: string } | null;
  follower: { id: string } | null;
  id: string;
};

type FollowGraph = { profileByHandle: FollowGraphProfile | null };

type NodeFollowGraph = {
  node: Omit<FollowGraphProfile, 'followersCount' | 'followingCount'> | null;
};

const followGraphFields = `
  followers(first: 10) { edges { node { id follower { id } followee { id } } } }
  following(first: 10) { edges { node { id follower { id } followee { id } } } }
  viewerFollow { id }
  viewerState { isSelf follow { id } }
`;

const requestNodeFollowGraph = (id: string, token: string) =>
  requestGraphQL<NodeFollowGraph>(
    `query NodeFollowGraph($id: ID!) {
      node(id: $id) {
        ... on Profile { ${followGraphFields} }
      }
    }`,
    { id: globalId('Profile', id) },
    token,
  );

const requestFollowGraph = (handle: string, token?: string) =>
  requestGraphQL<FollowGraph>(
    `query FollowGraph($handle: String!) {
      profileByHandle(handle: $handle) {
        ${followGraphFields}
        followersCount
        followingCount
      }
    }`,
    { handle },
    token,
  );

const globalId = (typename: string, id: string) =>
  Buffer.from(`${typename}:${id}`).toString('base64');

const assertRemoteFollowGraphHidesCounterparts = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  instanceState,
  profileState = ProfileState.ACTIVE,
}: {
  followPolicy?: ProfileFollowPolicy;
  instanceState?: InstanceState;
  profileState?: ProfileState;
}) => {
  const remoteInstance = await createRemoteInstance();
  const remote = await createProfile({
    handle: 'filtered-remote-follow-graph',
    instanceId: remoteInstance.id,
  });
  const counterpartInstanceId = instanceState
    ? await createRemoteInstance({
        domain: 'filtered-counterpart.example',
        state: instanceState,
      }).then((instance) => instance.id)
    : localInstanceId;
  const follower = await createProfile({
    followPolicy,
    handle: 'filtered-follower',
    instanceId: counterpartInstanceId,
    state: profileState,
  });
  const followee = await createProfile({
    followPolicy,
    handle: 'filtered-followee',
    instanceId: counterpartInstanceId,
    state: profileState,
  });
  await db.insert(ProfileFollows).values([
    { followerProfileId: follower.id, followeeProfileId: remote.id },
    { followerProfileId: remote.id, followeeProfileId: followee.id },
  ]);

  const result = await requestFollowGraph(`filtered-remote-follow-graph@${remoteDomain}`);

  assertNoGraphQLErrors(result);
  assert.deepEqual(result.data?.profileByHandle?.followers.edges, []);
  assert.deepEqual(result.data?.profileByHandle?.following.edges, []);
};

const requestViewerFollowScenario = async (
  relation: 'pending' | 'reverse',
  { followersCount, followingCount }: { followersCount?: number; followingCount?: number } = {},
) => {
  const auth = await createAuthenticatedSession();
  const remoteInstance = await createRemoteInstance();
  const remote = await createProfile({
    followersCount,
    followingCount,
    handle: `viewer-${relation}-remote`,
    instanceId: remoteInstance.id,
  });

  if (relation === 'reverse') {
    await db
      .insert(ProfileFollows)
      .values({ followerProfileId: remote.id, followeeProfileId: auth.profile.id });
  } else {
    await db.insert(ProfileFollowRequests).values([
      { followerProfileId: auth.profile.id, followeeProfileId: remote.id },
      { followerProfileId: remote.id, followeeProfileId: auth.profile.id },
    ]);
  }

  const result = await requestFollowGraph(`viewer-${relation}-remote@${remoteDomain}`, auth.token);
  return { result };
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

const createLocalInstance = async ({ domain }: { domain: string }) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createProfile = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  followersCount,
  followingCount,
  handle,
  instanceId,
  state = ProfileState.ACTIVE,
}: {
  followPolicy?: ProfileFollowPolicy;
  followersCount?: number;
  followingCount?: number;
  handle: string;
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
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async ({
  activeProfile = true,
}: { activeProfile?: boolean } = {}) => {
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
      activeProfileId: activeProfile ? profile.id : null,
      state: SessionState.ACTIVE,
      token,
    })
    .returning()
    .then(firstOrThrow);

  return { account, profile, session, token };
};

const resetFixtures = async () => {
  await db.delete(Sessions);
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
  assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, '/kosmo_test');
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
