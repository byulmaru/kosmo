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
import { decodeGlobalId, encodeGlobalId as globalId } from '@kosmo/core/global-id';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq, ne } from 'drizzle-orm';
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
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let Profiles: typeof CoreDb.Profiles;
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
      db,
      firstOrThrow,
      Instances,
      pg,
      ProfileBlocks,
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
      id: globalId('Profile', localTarget.id),
      handle: localTarget.handle,
      displayName: localTarget.displayName,
      domain: localDomain,
      instanceKind: 'LOCAL',
    });

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
      [globalId('Profile', localTarget.id), globalId('Profile', remoteTarget.id)].sort(),
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
        .where(eq(ProfileBlocks.id, decodeProfileBlockId(blockId)))
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

const createProfile = async (handle: string, instanceId = localInstanceId): Promise<ProfileRow> =>
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

const decodeProfileBlockId = (id: string) => {
  return decodeGlobalId(id).id;
};

const resetFixtures = async () => {
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
