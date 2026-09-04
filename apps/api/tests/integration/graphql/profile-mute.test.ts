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
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const remoteDomain = 'remote.example';
process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileMutes: typeof CoreDb.ProfileMutes;
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

describe('GraphQL Profile Mute', () => {
  before(async () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      db,
      firstOrThrow,
      Instances,
      pg,
      ProfileMutes,
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

  test('selected Profile의 Mute를 생성하고 Owner 전용 목록·Node·viewer 상태를 제공한다', async () => {
    const auth = await createAuthenticatedSession();
    const localTarget = await createProfile({
      handle: 'local-target',
      instanceId: localInstanceId,
    });
    const remoteInstance = await createRemoteInstance();
    const remoteTarget = await createProfile({
      handle: 'remote-target',
      instanceId: remoteInstance.id,
    });

    const localMutation = await muteProfile(localTarget.id, auth.token);
    assertNoGraphQLErrors(localMutation);
    const localMute = localMutation.data?.muteProfile.profileMute;
    assert.ok(localMute);
    assert.equal(localMute.targetProfile.id, globalId('Profile', localTarget.id));
    assert.ok(localMute.createdAt);

    const repeatedMutation = await muteProfile(localTarget.id, auth.token);
    assertNoGraphQLErrors(repeatedMutation);
    assert.equal(repeatedMutation.data?.muteProfile.profileMute.id, localMute.id);

    const remoteMutation = await muteProfile(remoteTarget.id, auth.token);
    assertNoGraphQLErrors(remoteMutation);
    const remoteMute = remoteMutation.data?.muteProfile.profileMute;
    assert.ok(remoteMute);
    assert.equal(remoteMute.targetProfile.id, globalId('Profile', remoteTarget.id));

    const expectedIds = [remoteMute.id, localMute.id].sort((first, second) =>
      decodeGlobalId(second).id.localeCompare(decodeGlobalId(first).id),
    );
    const firstPage = await requestGraphQL<{
      node: {
        profileMutes: {
          edges: Array<{ cursor: string; node: { id: string; targetProfile: { id: string } } }>;
          pageInfo: { endCursor: string | null; hasNextPage: boolean };
        };
      } | null;
    }>(
      `query ProfileMutes($id: ID!, $first: Int) {
        node(id: $id) {
          ... on Profile {
            profileMutes(first: $first) {
              edges { cursor node { id targetProfile { id } } }
              pageInfo { endCursor hasNextPage }
            }
          }
        }
      }`,
      { first: 1, id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(firstPage);
    assert.deepEqual(
      firstPage.data?.node?.profileMutes.edges.map(({ node }) => node.id),
      expectedIds.slice(0, 1),
    );
    assert.equal(firstPage.data?.node?.profileMutes.pageInfo.hasNextPage, true);

    const secondPage = await requestGraphQL<{
      node: {
        profileMutes: {
          edges: Array<{ node: { id: string; targetProfile: { id: string } } }>;
          pageInfo: { hasNextPage: boolean };
        };
      } | null;
    }>(
      `query ProfileMutesAfter($id: ID!, $after: String!) {
        node(id: $id) {
          ... on Profile {
            profileMutes(first: 1, after: $after) {
              edges { node { id targetProfile { id } } }
              pageInfo { hasNextPage }
            }
          }
        }
      }`,
      {
        after: firstPage.data?.node?.profileMutes.pageInfo.endCursor,
        id: globalId('Profile', auth.profile.id),
      },
      auth.token,
    );
    assertNoGraphQLErrors(secondPage);
    assert.deepEqual(
      secondPage.data?.node?.profileMutes.edges.map(({ node }) => node.id),
      expectedIds.slice(1),
    );
    assert.equal(secondPage.data?.node?.profileMutes.pageInfo.hasNextPage, false);

    const backward = await requestGraphQL<{
      node: { profileMutes: { edges: Array<{ node: { id: string } }> } } | null;
    }>(
      `query ProfileMutesBackward($id: ID!) {
        node(id: $id) {
          ... on Profile {
            profileMutes(last: 1) { edges { node { id } } }
          }
        }
      }`,
      { id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(backward);
    assert.deepEqual(
      backward.data?.node?.profileMutes.edges.map(({ node }) => node.id),
      expectedIds.slice(-1),
    );

    const targetState = await requestGraphQL<{
      node: {
        viewerState: { profileMute: { id: string; targetProfile: { id: string } } | null };
      } | null;
    }>(
      `query TargetViewerState($id: ID!) {
        node(id: $id) {
          ... on Profile {
            viewerState { profileMute { id targetProfile { id } } }
          }
        }
      }`,
      { id: globalId('Profile', localTarget.id) },
      auth.token,
    );
    assertNoGraphQLErrors(targetState);
    assert.deepEqual(targetState.data?.node?.viewerState.profileMute, {
      id: localMute.id,
      targetProfile: { id: globalId('Profile', localTarget.id) },
    });

    const muteNode = await requestGraphQL<{
      node: {
        id: string;
        targetProfile: { id: string };
        createdAt: string;
      } | null;
    }>(
      `query ProfileMuteNode($id: ID!) {
        node(id: $id) {
          ... on ProfileMute { id targetProfile { id } createdAt }
        }
      }`,
      { id: localMute.id },
      auth.token,
    );
    assertNoGraphQLErrors(muteNode);
    assert.equal(muteNode.data?.node?.id, localMute.id);
    assert.equal(muteNode.data?.node?.targetProfile?.id, globalId('Profile', localTarget.id));

    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, localTarget.id));

    const disabledTargetMuteNode = await requestGraphQL<{
      node: { id: string; targetProfile: { id: string } } | null;
    }>(
      `query DisabledTargetProfileMute($id: ID!) {
        node(id: $id) {
          ... on ProfileMute { id targetProfile { id } }
        }
      }`,
      { id: localMute.id },
      auth.token,
    );
    assertNoGraphQLErrors(disabledTargetMuteNode);
    assert.equal(disabledTargetMuteNode.data?.node, null);

    const disabledTargetMuteConnection = await requestGraphQL<{
      node: { profileMutes: { edges: Array<{ node: { id: string } }> } } | null;
    }>(
      `query DisabledTargetProfileMutes($id: ID!) {
        node(id: $id) {
          ... on Profile { profileMutes(first: 10) { edges { node { id } } } }
        }
      }`,
      { id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(disabledTargetMuteConnection);
    assert.equal(
      disabledTargetMuteConnection.data?.node?.profileMutes.edges.some(
        ({ node }) => node.id === localMute.id,
      ),
      false,
    );

    const unmuteUsingProfileMuteId = await requestGraphQL<{
      unmuteProfile: { profileMuteId: string | null };
    }>(
      `mutation UnmuteDisabledTarget($input: UnmuteProfileInput!) {
        unmuteProfile(input: $input) { profileMuteId }
      }`,
      { input: { id: localMute.id } },
      auth.token,
    );
    assertNoGraphQLErrors(unmuteUsingProfileMuteId);
    assert.equal(unmuteUsingProfileMuteId.data?.unmuteProfile.profileMuteId, localMute.id);
    assert.equal(
      await db.$count(ProfileMutes, eq(ProfileMutes.id, decodeGlobalId(localMute.id).id)),
      0,
    );
  });

  test('숨겨진 선두 Profile Mute 관계를 건너뛰고 다음 visible 관계로 페이지를 채운다', async () => {
    const auth = await createAuthenticatedSession();
    const localTarget = await createProfile({
      handle: 'hidden-page-local-target',
      instanceId: localInstanceId,
    });
    const remoteInstance = await createRemoteInstance({ domain: 'hidden-page-remote.example' });
    const remoteTarget = await createProfile({
      handle: 'hidden-page-remote-target',
      instanceId: remoteInstance.id,
    });

    const localMutation = await muteProfile(localTarget.id, auth.token);
    const remoteMutation = await muteProfile(remoteTarget.id, auth.token);
    assertNoGraphQLErrors(localMutation);
    assertNoGraphQLErrors(remoteMutation);
    const localMute = localMutation.data?.muteProfile.profileMute;
    const remoteMute = remoteMutation.data?.muteProfile.profileMute;
    assert.ok(localMute);
    assert.ok(remoteMute);

    const orderedMutes = [localMute, remoteMute].sort((first, second) =>
      decodeGlobalId(second.id).id.localeCompare(decodeGlobalId(first.id).id),
    );
    const hiddenMute = orderedMutes[0]!;
    const visibleMute = orderedMutes[1]!;
    const hiddenTargetId = hiddenMute.id === localMute.id ? localTarget.id : remoteTarget.id;

    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, hiddenTargetId));

    const hiddenNode = await requestGraphQL<{ node: { id: string } | null }>(
      `query HiddenLeadingProfileMute($id: ID!) {
        node(id: $id) { ... on ProfileMute { id } }
      }`,
      { id: hiddenMute.id },
      auth.token,
    );
    assertNoGraphQLErrors(hiddenNode);
    assert.equal(hiddenNode.data?.node, null);

    const visiblePage = await requestGraphQL<{
      node: {
        profileMutes: {
          edges: Array<{ node: { id: string } }>;
          pageInfo: { hasNextPage: boolean };
        };
      } | null;
    }>(
      `query VisibleAfterHiddenProfileMute($id: ID!) {
        node(id: $id) {
          ... on Profile {
            profileMutes(first: 1) { edges { node { id } } pageInfo { hasNextPage } }
          }
        }
      }`,
      { id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assertNoGraphQLErrors(visiblePage);
    assert.deepEqual(
      visiblePage.data?.node?.profileMutes.edges.map(({ node }) => node.id),
      [visibleMute.id],
    );
    assert.equal(visiblePage.data?.node?.profileMutes.pageInfo.hasNextPage, false);
  });

  test('Profile Mute 관계·목록·viewer 상태와 해제는 Owner와 selected Profile별로 격리된다', async () => {
    const auth = await createAuthenticatedSession();
    const secondProfile = await createProfile({
      handle: 'same-account-second',
      instanceId: localInstanceId,
    });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: secondProfile.id,
      role: AccountProfileRole.OWNER,
    });
    const outsider = await createAuthenticatedSession();
    const target = await createProfile({
      handle: 'owner-only-target',
      instanceId: localInstanceId,
    });

    const created = await muteProfile(target.id, auth.token);
    assertNoGraphQLErrors(created);
    const muteId = created.data?.muteProfile.profileMute.id;
    assert.ok(muteId);

    const wrongTypeUnmute = await requestGraphQL<{
      unmuteProfile: { profileMuteId: string | null };
    }>(
      `mutation UnmuteProfileWithProfileId($input: UnmuteProfileInput!) {
        unmuteProfile(input: $input) { profileMuteId }
      }`,
      { input: { id: globalId('Profile', target.id) } },
      auth.token,
    );
    assert.match(wrongTypeUnmute.errors?.[0]?.message ?? '', /not of type: ProfileMute/);
    assert.equal(await db.$count(ProfileMutes), 1);

    const outsiderState = await requestGraphQL<{
      node: { viewerState: { profileMute: unknown | null } } | null;
    }>(
      `query TargetViewerState($id: ID!) {
        node(id: $id) { ... on Profile { viewerState { profileMute { id } } } }
      }`,
      { id: globalId('Profile', target.id) },
      outsider.token,
    );
    assertNoGraphQLErrors(outsiderState);
    assert.equal(outsiderState.data?.node?.viewerState.profileMute, null);

    const outsiderNode = await requestGraphQL<{ node: unknown | null }>(
      `query HiddenProfileMute($id: ID!) {
        node(id: $id) { ... on ProfileMute { id } }
      }`,
      { id: muteId },
      outsider.token,
    );
    assertNoGraphQLErrors(outsiderNode);
    assert.equal(outsiderNode.data?.node, null);

    await db
      .update(Sessions)
      .set({ activeProfileId: secondProfile.id })
      .where(eq(Sessions.id, auth.session.id));

    const switchedState = await requestGraphQL<{
      node: { viewerState: { profileMute: unknown | null } } | null;
    }>(
      `query SwitchedViewerState($id: ID!) {
        node(id: $id) { ... on Profile { viewerState { profileMute { id } } } }
      }`,
      { id: globalId('Profile', target.id) },
      auth.token,
    );
    assertNoGraphQLErrors(switchedState);
    assert.equal(switchedState.data?.node?.viewerState.profileMute, null);

    const switchedList = await requestGraphQL<{ node: { profileMutes: unknown } | null }>(
      `query SwitchedProfileMutes($id: ID!) {
        node(id: $id) { ... on Profile { profileMutes(first: 1) { edges { node { id } } } } }
      }`,
      { id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assert.equal(switchedList.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const switchedUnmute = await unmuteProfile(muteId, auth.token);
    assertNoGraphQLErrors(switchedUnmute);
    assert.equal(switchedUnmute.data?.unmuteProfile.profileMuteId, null);
    assert.equal(await db.$count(ProfileMutes, eq(ProfileMutes.id, decodeGlobalId(muteId).id)), 1);

    await db
      .update(Sessions)
      .set({ activeProfileId: auth.profile.id })
      .where(eq(Sessions.id, auth.session.id));

    const removed = await unmuteProfile(muteId, auth.token);
    assertNoGraphQLErrors(removed);
    assert.equal(removed.data?.unmuteProfile.profileMuteId, muteId);
    assert.equal(await db.$count(ProfileMutes, eq(ProfileMutes.id, decodeGlobalId(muteId).id)), 0);
  });

  test('DISABLED Profile과 SUSPENDED Instance의 Target은 Mute 생성에서 거부되고 관계를 만들지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const disabledTarget = await createProfile({
      handle: 'disabled-mute-target',
      instanceId: localInstanceId,
      state: ProfileState.DISABLED,
    });
    const suspendedInstance = await createRemoteInstance({
      domain: 'suspended-mute-target.example',
      state: InstanceState.SUSPENDED,
    });
    const suspendedTarget = await createProfile({
      handle: 'suspended-mute-target',
      instanceId: suspendedInstance.id,
    });

    const disabledResult = await muteProfile(disabledTarget.id, auth.token);
    const suspendedResult = await muteProfile(suspendedTarget.id, auth.token);
    assert.equal(disabledResult.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(suspendedResult.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(await db.$count(ProfileMutes), 0);
  });

  test('Remote selected Profile은 Profile Mute Owner로 사용할 수 없다', async () => {
    const remoteInstance = await createRemoteInstance({ domain: 'remote-owner.example' });
    const remoteOwner = await createAuthenticatedSession({ instanceId: remoteInstance.id });
    const target = await createProfile({
      handle: 'remote-owner-target',
      instanceId: localInstanceId,
    });

    const result = await muteProfile(target.id, remoteOwner.token);
    assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(await db.$count(ProfileMutes), 0);
  });
});

const muteProfile = (targetProfileId: string, token: string) =>
  requestGraphQL<{
    muteProfile: {
      profileMute: {
        id: string;
        createdAt: string;
        targetProfile: { id: string };
      };
    };
  }>(
    `mutation MuteProfile($input: MuteProfileInput!) {
      muteProfile(input: $input) {
        profileMute { id createdAt targetProfile { id } }
      }
    }`,
    { input: { id: globalId('Profile', targetProfileId) } },
    token,
  );

const unmuteProfile = (profileMuteId: string, token: string) =>
  requestGraphQL<{
    unmuteProfile: { profileMuteId: string | null };
  }>(
    `mutation UnmuteProfile($input: UnmuteProfileInput!) {
      unmuteProfile(input: $input) { profileMuteId }
    }`,
    { input: { id: profileMuteId } },
    token,
  );

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

const createProfile = async ({
  handle,
  instanceId,
  state = ProfileState.ACTIVE,
}: {
  handle: string;
  instanceId: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: handle,
      state,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async ({
  instanceId = localInstanceId,
}: { instanceId?: string } = {}) => {
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
    instanceId,
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

const resetFixtures = async () => {
  await db.delete(Sessions);
  await db.delete(ProfileMutes);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db.delete(Instances).where(eq(Instances.kind, InstanceKind.ACTIVITYPUB));
  await db
    .delete(Instances)
    .where(and(eq(Instances.kind, InstanceKind.LOCAL), ne(Instances.id, localInstanceId)));
};

const truncateDatabase = async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(databaseUrl.hostname));
  assert.match(decodeURIComponent(databaseUrl.pathname.slice(1)), /^kosmo_test(?:_[a-z0-9_]+)?$/);
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
