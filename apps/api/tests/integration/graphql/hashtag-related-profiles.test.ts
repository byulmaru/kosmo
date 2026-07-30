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
import { encodeGlobalId as globalId } from '@kosmo/core/global-id';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Hashtags: typeof CoreDb.Hashtags;
let Instances: typeof CoreDb.Instances;
let ProfileHashtags: typeof CoreDb.ProfileHashtags;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let pg: typeof CoreDb.pg;
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

type RelatedProfilesConnection = {
  edges: Array<{ cursor: string; node: { id: string } }>;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
};

type RelatedProfilesData = {
  node: { relatedProfiles: RelatedProfilesConnection } | null;
};

const relatedProfilesQuery = `query RelatedProfiles($id: ID!, $after: String, $first: Int) {
  node(id: $id) {
    ... on Hashtag {
      relatedProfiles(first: $first, after: $after) {
        edges { cursor node { id } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }
}`;

describe('GraphQL Hashtag related Profiles', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      db,
      firstOrThrow,
      Hashtags,
      Instances,
      ProfileHashtags,
      Profiles,
      Sessions,
      pg,
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

  test('requires login before candidate lookup and allows an account without a selected Profile', async () => {
    const hashtag = await createHashtag('auth');
    const related = await createProfile({ handle: 'auth-related', id: profileId(1) });
    await addTag(related.id, hashtag.id);

    for (const token of [undefined, 'invalid-token']) {
      const result = await requestGraphQL<RelatedProfilesData>(
        relatedProfilesQuery,
        { id: globalId('Hashtag', hashtag.id) },
        token,
      );

      assert.equal(result.data?.node, null);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }

    const authenticatedWithoutProfile = await createAuthenticatedSession({
      selectedProfile: false,
    });
    const result = await requestGraphQL<RelatedProfilesData>(
      relatedProfilesQuery,
      { id: globalId('Hashtag', hashtag.id) },
      authenticatedWithoutProfile.token,
    );

    assertNoGraphQLErrors(result);
    assert.deepEqual(
      result.data?.node?.relatedProfiles.edges.map(({ node }) => node.id),
      [globalId('Profile', related.id)],
    );
  });

  test('uses exact relation and fills the page after applying public visibility', async () => {
    const hashtag = await createHashtag('exact');
    const otherHashtag = await createHashtag('other');
    const visibleProfiles = await Promise.all(
      [1, ...Array.from({ length: 20 }, (_, index) => index + 3)].map((id) =>
        createProfile({ handle: `visible-${id}`, id: profileId(id) }),
      ),
    );
    const disabled = await createProfile({
      handle: 'disabled',
      id: profileId(2),
      state: ProfileState.DISABLED,
    });
    const suspended = await createProfile({
      handle: 'suspended',
      id: profileId(23),
      state: ProfileState.SUSPENDED,
    });
    const suspendedInstance = await createLocalInstance({
      domain: 'suspended.example',
      state: InstanceState.SUSPENDED,
    });
    const suspendedInstanceProfile = await createProfile({
      handle: 'suspended-instance',
      id: profileId(24),
      instanceId: suspendedInstance.id,
    });
    const other = await createProfile({ handle: 'other-only', id: profileId(26) });

    await db
      .insert(ProfileHashtags)
      .values([
        ...visibleProfiles.map(({ id }) => ({ hashtagId: hashtag.id, profileId: id })),
        { hashtagId: hashtag.id, profileId: disabled.id },
        { hashtagId: hashtag.id, profileId: suspended.id },
        { hashtagId: hashtag.id, profileId: suspendedInstanceProfile.id },
        { hashtagId: otherHashtag.id, profileId: other.id },
      ]);

    const auth = await createAuthenticatedSession();
    const firstPage = await requestGraphQL<RelatedProfilesData>(
      relatedProfilesQuery,
      { id: globalId('Hashtag', hashtag.id) },
      auth.token,
    );

    assertNoGraphQLErrors(firstPage);
    assert.deepEqual(
      firstPage.data?.node?.relatedProfiles.edges.map(({ node }) => node.id),
      visibleProfiles.slice(0, 20).map(({ id }) => globalId('Profile', id)),
    );
    const endCursor = firstPage.data?.node?.relatedProfiles.pageInfo.endCursor;
    assert.ok(endCursor);
    assert.notEqual(endCursor, visibleProfiles[19]!.id);
    assert.equal(firstPage.data?.node?.relatedProfiles.edges.length, 20);
    assert.equal(firstPage.data?.node?.relatedProfiles.pageInfo.hasNextPage, true);

    const secondPage = await requestGraphQL<RelatedProfilesData>(
      relatedProfilesQuery,
      {
        after: firstPage.data?.node?.relatedProfiles.pageInfo.endCursor,
        first: 20,
        id: globalId('Hashtag', hashtag.id),
      },
      auth.token,
    );

    assertNoGraphQLErrors(secondPage);
    assert.deepEqual(
      secondPage.data?.node?.relatedProfiles.edges.map(({ node }) => node.id),
      [globalId('Profile', visibleProfiles[20]!.id)],
    );
    assert.equal(secondPage.data?.node?.relatedProfiles.pageInfo.hasNextPage, false);

    const emptyHashtag = await createHashtag('empty');
    const empty = await requestGraphQL<RelatedProfilesData>(
      relatedProfilesQuery,
      { id: globalId('Hashtag', emptyHashtag.id) },
      auth.token,
    );

    assertNoGraphQLErrors(empty);
    assert.deepEqual(empty.data?.node?.relatedProfiles.edges, []);
    assert.equal(empty.data?.node?.relatedProfiles.pageInfo.hasNextPage, false);
  });

  test('caps oversized pages and uses Profile.id ascending independently of relation row order', async () => {
    const hashtag = await createHashtag('pagination');
    const profiles = await Promise.all(
      Array.from({ length: 22 }, (_, index) => index + 1).map((id) =>
        createProfile({ handle: `page-${id}`, id: profileId(100 + id) }),
      ),
    );

    await db
      .insert(ProfileHashtags)
      .values([...profiles].reverse().map(({ id }) => ({ hashtagId: hashtag.id, profileId: id })));

    const auth = await createAuthenticatedSession();
    const firstPage = await requestGraphQL<RelatedProfilesData>(
      relatedProfilesQuery,
      { first: 50, id: globalId('Hashtag', hashtag.id) },
      auth.token,
    );

    assertNoGraphQLErrors(firstPage);
    assert.equal(firstPage.data?.node?.relatedProfiles.edges.length, 20);
    assert.deepEqual(
      firstPage.data?.node?.relatedProfiles.edges.map(({ node }) => node.id),
      profiles.slice(0, 20).map(({ id }) => globalId('Profile', id)),
    );
    assert.equal(firstPage.data?.node?.relatedProfiles.pageInfo.hasNextPage, true);

    const secondPage = await requestGraphQL<RelatedProfilesData>(
      relatedProfilesQuery,
      {
        after: firstPage.data?.node?.relatedProfiles.pageInfo.endCursor,
        first: 50,
        id: globalId('Hashtag', hashtag.id),
      },
      auth.token,
    );

    assertNoGraphQLErrors(secondPage);
    const pages = [
      ...(firstPage.data?.node?.relatedProfiles.edges ?? []),
      ...(secondPage.data?.node?.relatedProfiles.edges ?? []),
    ];
    assert.deepEqual(
      pages.map(({ node }) => node.id),
      profiles.map(({ id }) => globalId('Profile', id)),
    );
    assert.equal(new Set(pages.map(({ node }) => node.id)).size, profiles.length);
    assert.equal(secondPage.data?.node?.relatedProfiles.pageInfo.hasNextPage, false);
  });

  test('rejects malformed and non-canonical cursors as validation errors', async () => {
    const hashtag = await createHashtag('cursor-validation');
    const auth = await createAuthenticatedSession();

    for (const after of ['', 'not-a-cursor', 'MA==']) {
      const result = await requestGraphQL<RelatedProfilesData>(
        relatedProfilesQuery,
        { after, id: globalId('Hashtag', hashtag.id) },
        auth.token,
      );
      assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
    }
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

const createHashtag = async (name: string) =>
  db.insert(Hashtags).values({ displayName: name, name }).returning().then(firstOrThrow);

const addTag = (profileId: string, hashtagId: string) =>
  db.insert(ProfileHashtags).values({ hashtagId, profileId });

const profileId = (value: number) =>
  `00000000-0000-8006-8000-${value.toString(16).padStart(12, '0')}`;

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
  handle,
  id,
  instanceId = localInstanceId,
  state = ProfileState.ACTIVE,
}: {
  handle: string;
  id: string;
  instanceId?: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      id,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async ({
  selectedProfile = true,
}: { selectedProfile?: boolean } = {}) => {
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
    id: crypto.randomUUID(),
  });
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const token = `token-${crypto.randomUUID()}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: selectedProfile ? profile.id : null,
    state: SessionState.ACTIVE,
    token,
  });

  return { token };
};

const resetFixtures = async () => {
  await db.delete(ProfileHashtags);
  await db.delete(Hashtags);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
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
