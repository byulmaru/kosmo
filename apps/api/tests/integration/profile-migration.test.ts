import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { Endpoints, Person } from '@fedify/vocab';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId as globalId } from '@kosmo/core/global-id';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as Fedify from '@kosmo/fedify';
import type { deriveContext as DeriveContext, Env } from '../../src/context';
import type { yoga as YogaRouter } from '../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const remoteDomain = 'remote.example';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileMigrations: typeof CoreDb.ProfileMigrations;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let remoteFederation: typeof Fedify.federation;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;

type GraphQLErrorResult = {
  extensions?: { code?: string; field?: string };
  message: string;
};

type GraphQLResult<TData = Record<string, unknown>> = {
  data?: TData | null;
  errors?: GraphQLErrorResult[];
};

const prepareMutation = `mutation PrepareProfileMigration($input: PrepareProfileMigrationInput!) {
  prepareProfileMigration(input: $input) {
    profile {
      id
      displayName
      relativeHandle
      migrationSource {
        id
        displayName
        relativeHandle
      }
    }
  }
}`;

describe('GraphQL profile migration', () => {
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
      ProfileMigrations,
      Profiles,
      Sessions,
    } = await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));
    ({ federation: remoteFederation } = await import('@kosmo/fedify'));

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../src/context'));
    ({ yoga } = await import('../../src/graphql'));

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

  test('active owner authentication is required before remote lookup, even when the feature flag is off', async (t) => {
    const target = await createProfile({
      displayName: 'Migration Target',
      handle: 'migration-target',
    });
    const member = await createAuthenticatedSession({
      featureFlags: [],
      profileId: target.id,
      role: AccountProfileRole.MEMBER,
    });
    const inactive = await createAuthenticatedSession({
      accountState: AccountState.DISABLED,
      featureFlags: [],
      profileId: target.id,
      role: AccountProfileRole.OWNER,
    });
    const createContext = t.mock.method(remoteFederation, 'createContext');

    for (const token of [member.token, inactive.token, undefined]) {
      const result = await requestGraphQL(
        prepareMutation,
        {
          input: {
            profileId: globalId('Profile', target.id),
            sourceHandle: `@alice@${remoteDomain}`,
          },
        },
        token,
      );

      assertGraphQLErrorCode(result, 'PERMISSION_DENIED');
    }

    assert.equal(createContext.mock.calls.length, 0);
    assert.equal(await countMigrations(), 0);
  });

  test('remote source lookup failure leaves the target and migration rows unchanged', async (t) => {
    const auth = await createAuthenticatedSession({
      profileId: (await createProfile({ handle: 'migration-target' })).id,
    });
    const lookupObject = mock.fn(async () => null);
    t.mock.method(remoteFederation, 'createContext', () => ({ lookupObject }) as never);

    const result = await requestGraphQL(
      prepareMutation,
      {
        input: {
          profileId: globalId('Profile', auth.profile.id),
          sourceHandle: `@missing@${remoteDomain}`,
        },
      },
      auth.token,
    );

    assertGraphQLErrorCode(result, 'VALIDATION');
    assert.equal(result.errors?.[0]?.extensions?.field, 'sourceHandle');
    assert.equal(lookupObject.mock.calls.length, 1);
    assert.equal(await countMigrations(), 0);
    assert.equal(await countProfiles(), 1);
  });

  test('successful preparation returns the target and resolves migrationSource by target Profile ID', async (t) => {
    const auth = await createAuthenticatedSession({
      profileId: (
        await createProfile({ displayName: 'Migration Target', handle: 'migration-target' })
      ).id,
    });
    const lookupObject = mock.fn(async () => createLookupActor());
    t.mock.method(remoteFederation, 'createContext', () => ({ lookupObject }) as never);

    const result = await requestGraphQL<{
      prepareProfileMigration: {
        profile: {
          displayName: string;
          id: string;
          migrationSource: { displayName: string; id: string; relativeHandle: string };
          relativeHandle: string;
        };
      };
    }>(
      prepareMutation,
      {
        input: {
          profileId: globalId('Profile', auth.profile.id),
          sourceHandle: `@alice@${remoteDomain}`,
        },
      },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(lookupObject.mock.calls.length, 1);

    const migration = await db
      .select()
      .from(ProfileMigrations)
      .where(eq(ProfileMigrations.targetProfileId, auth.profile.id))
      .then(firstOrThrow);
    const source = await db
      .select()
      .from(Profiles)
      .where(eq(Profiles.id, migration.sourceProfileId))
      .then(firstOrThrow);

    assert.deepEqual(result.data?.prepareProfileMigration.profile, {
      displayName: 'Migration Target',
      id: globalId('Profile', auth.profile.id),
      migrationSource: {
        displayName: 'Alice Remote',
        id: globalId('Profile', source.id),
        relativeHandle: `@alice@${remoteDomain}`,
      },
      relativeHandle: '@migration-target',
    });

    const read = await requestGraphQL<{
      source: { id: string; migrationSource: null } | null;
      target: { id: string; migrationSource: { id: string } | null } | null;
    }>(
      `query ReadMigrationSource($sourceId: ID!, $targetId: ID!) {
        target: node(id: $targetId) {
          ... on Profile { id migrationSource { id } }
        }
        source: node(id: $sourceId) {
          ... on Profile { id migrationSource { id } }
        }
      }`,
      {
        sourceId: globalId('Profile', source.id),
        targetId: globalId('Profile', auth.profile.id),
      },
      auth.token,
    );

    assertNoGraphQLErrors(read);
    assert.deepEqual(read.data, {
      source: { id: globalId('Profile', source.id), migrationSource: null },
      target: {
        id: globalId('Profile', auth.profile.id),
        migrationSource: { id: globalId('Profile', source.id) },
      },
    });
  });
});

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

const createProfile = async ({
  handle,
  displayName = handle,
  followPolicy = ProfileFollowPolicy.OPEN,
  instanceId = localInstanceId,
  state = ProfileState.ACTIVE,
}: {
  displayName?: string;
  followPolicy?: ProfileFollowPolicy;
  handle: string;
  instanceId?: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      displayName,
      followPolicy,
      handle,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async ({
  accountState = AccountState.ACTIVE,
  featureFlags = [],
  profileId,
  role = AccountProfileRole.OWNER,
}: {
  accountState?: AccountState;
  featureFlags?: string[];
  profileId?: string;
  role?: AccountProfileRole;
} = {}) => {
  const profile = profileId
    ? await db.select().from(Profiles).where(eq(Profiles.id, profileId)).then(firstOrThrow)
    : await createProfile({ handle: `viewer-${crypto.randomUUID().slice(0, 8)}` });
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({
      displayName: suffix,
      featureFlags,
      oidcSubject: `subject-${suffix}`,
      state: accountState,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(AccountProfiles).values({ accountId: account.id, profileId: profile.id, role });
  const token = `token-${suffix}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: profile.id,
    state: SessionState.ACTIVE,
    token,
  });

  return { account, profile, token };
};

const createLookupActor = () =>
  new Person({
    endpoints: new Endpoints({ sharedInbox: new URL(`https://${remoteDomain}/inbox`) }),
    followers: new URL(`https://${remoteDomain}/users/alice/followers`),
    following: new URL(`https://${remoteDomain}/users/alice/following`),
    id: new URL(`https://${remoteDomain}/users/alice`),
    inbox: new URL(`https://${remoteDomain}/users/alice/inbox`),
    name: 'Alice Remote',
    outbox: new URL(`https://${remoteDomain}/users/alice/outbox`),
    preferredUsername: 'alice',
    published: Temporal.Instant.from('2024-01-02T03:04:05Z'),
    summary: 'Remote bio',
  });

const countMigrations = () => db.$count(ProfileMigrations);

const countProfiles = () => db.$count(Profiles);

const resetFixtures = async () => {
  await db.delete(ProfileMigrations);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(ActivityPubActors);
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
