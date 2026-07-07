import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../context';
import type { yoga as YogaRouter } from './index';

const publicOrigin = 'http://127.0.0.1:4173';
const localDomain = '127.0.0.1:4173';
const remoteDomain = 'remote.example';
const databaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
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
      ActivityPubActors,
      db,
      firstOrThrow,
      Instances,
      pg,
      ProfileFollows,
      Profiles,
      Sessions,
    } = await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../context'));
    ({ yoga } = await import('./index'));

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

  test('returns stored remote follow graph data', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });

    const [viewerFollow, reverseFollow] = await db
      .insert(ProfileFollows)
      .values([
        { followerProfileId: auth.profile.id, followeeProfileId: remote.id },
        { followerProfileId: remote.id, followeeProfileId: auth.profile.id },
      ])
      .returning();

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
      followers: { edges: [{ node: { id: viewerFollow!.id } }] },
      followersCount: 0,
      following: { edges: [{ node: { id: reverseFollow!.id } }] },
      followingCount: 0,
      viewerFollow: { id: viewerFollow!.id },
      viewerState: { follow: { id: viewerFollow!.id }, isSelf: false },
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

  test('rejects following a remote profile without actor metadata', async () => {
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

  test('returns an existing remote follow idempotently', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    await db.insert(ActivityPubActors).values({
      profileId: remote.id,
      type: ActivityPubActorType.PERSON,
      uri: `https://${remoteDomain}/users/remote`,
    });
    const follow = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: auth.profile.id, followeeProfileId: remote.id })
      .returning()
      .then(firstOrThrow);

    const result = await requestGraphQL<{
      followProfile: { profileFollow: { id: string } } | null;
    }>(
      `mutation FollowRemote($id: ID!) {
        followProfile(input: { id: $id }) { profileFollow { id } }
      }`,
      { id: remote.id },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.followProfile?.profileFollow.id, follow.id);
    assert.equal(await countRows(ProfileFollows), 1);
  });

  test('deletes an existing remote follow locally when delivery metadata is absent', async () => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createRemoteInstance();
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstance.id });
    const follow = await db
      .insert(ProfileFollows)
      .values({ followerProfileId: auth.profile.id, followeeProfileId: remote.id })
      .returning()
      .then(firstOrThrow);

    const result = await requestGraphQL<{
      unfollowProfile: { profileFollowId: string | null } | null;
    }>(
      `mutation UnfollowRemote($id: ID!) {
        unfollowProfile(input: { id: $id }) { profileFollowId }
      }`,
      { id: remote.id },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.unfollowProfile?.profileFollowId, follow.id);
    assert.equal(await countRows(ProfileFollows), 0);
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

const createRemoteInstance = async () =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${remoteDomain}`,
      domain: remoteDomain,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
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
