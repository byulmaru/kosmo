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
let Hashtags: typeof CoreDb.Hashtags;
let HashtagMuteRules: typeof CoreDb.HashtagMuteRules;
let HashtagMuteRuleCommands: typeof CoreDb.HashtagMuteRuleCommands;

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

describe('GraphQL Hashtag Mute Rule', () => {
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
      Hashtags,
      HashtagMuteRules,
      HashtagMuteRuleCommands,
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
  after(async () => pg.end());

  test('Member와 Owner가 shared Hashtag 규칙을 생성하고 Scope별 상태·관리 목록·Node를 조회한다', async () => {
    for (const role of [AccountProfileRole.MEMBER, AccountProfileRole.OWNER]) {
      const auth = await createAuthenticatedSession(role);
      const hashtag = await createHashtag();
      const rule = await createRule(auth.token, hashtag.id, {
        scopes: ['HOME', 'LOCAL'],
        decision: 'COLLAPSE',
        expiresAt: null,
      });
      assert.deepEqual(rule.scopes, ['HOME', 'LOCAL']);
      assert.equal(rule.decision, 'COLLAPSE');
      assert.equal(rule.expiresAt, null);
      assert.equal(rule.isActive, true);
      assert.equal(rule.home, true);
      assert.equal(rule.search, false);
      assert.equal(rule.targetHashtag.id, globalId('Hashtag', hashtag.id));
      const node = await queryRule(rule.id, auth.token);
      assertNoGraphQLErrors(node);
      assert.deepEqual(node.data?.node, rule);
      const viewer = await requestGraphQL<{ node: { viewerMuteRule: Rule | null } }>(
        `query($id: ID!) { node(id: $id) { ... on Hashtag { viewerMuteRule { ${ruleFields} } } } }`,
        { id: globalId('Hashtag', hashtag.id) },
        auth.token,
      );
      assertNoGraphQLErrors(viewer);
      assert.deepEqual(viewer.data?.node.viewerMuteRule, rule);
      const list = await requestGraphQL<{
        node: { hashtagMuteRules: { edges: { node: Rule }[] } };
      }>(
        `query($id: ID!) { node(id: $id) { ... on Profile { hashtagMuteRules(first: 10) { edges { node { ${ruleFields} } } } } } }`,
        { id: globalId('Profile', auth.profile.id) },
        auth.token,
      );
      assertNoGraphQLErrors(list);
      assert.deepEqual(list.data?.node.hashtagMuteRules.edges, [{ node: rule }]);
      const duplicate = await createResult(auth.token, hashtag.id, {
        scopes: ['SEARCH'],
        decision: 'EXCLUDE',
        expiresAt: null,
      });
      assert.equal(duplicate.errors?.[0].extensions?.code, 'CONFLICT');
      assert.equal(
        await db.$count(HashtagMuteRules, eq(HashtagMuteRules.ownerProfileId, auth.profile.id)),
        1,
      );
      assert.deepEqual((await queryRule(rule.id, auth.token)).data?.node, rule);
    }
  });

  test('부분 변경의 생략·null과 만료된 최종 상태를 검증하며 해제 뒤 정확한 Rule ID를 반환한다', async (t) => {
    const auth = await createAuthenticatedSession();
    const hashtag = await createHashtag();
    const future = Temporal.Now.instant().add({ hours: 1 }).toString();
    const rule = await createRule(auth.token, hashtag.id, {
      scopes: ['HOME'],
      decision: 'EXCLUDE',
      expiresAt: future,
    });
    const updated = await updateResult(auth.token, rule.id, { decision: 'COLLAPSE' });
    assertNoGraphQLErrors(updated);
    assert.equal(updated.data?.updateHashtagMuteRule.hashtagMuteRule.expiresAt, rule.expiresAt);
    const permanent = await updateResult(auth.token, rule.id, { expiresAt: null });
    assertNoGraphQLErrors(permanent);
    assert.equal(permanent.data?.updateHashtagMuteRule.hashtagMuteRule.expiresAt, null);
    const expiresAgain = await updateResult(auth.token, rule.id, {
      expiresAt: future,
      scopes: ['SEARCH'],
    });
    assertNoGraphQLErrors(expiresAgain);
    assert.equal(expiresAgain.data?.updateHashtagMuteRule.hashtagMuteRule.home, false);
    assert.equal(expiresAgain.data?.updateHashtagMuteRule.hashtagMuteRule.search, true);
    const ruleId = decodeGlobalId(rule.id).id;
    await db
      .update(HashtagMuteRules)
      .set({ expiresAt: Temporal.Now.instant().subtract({ seconds: 1 }) })
      .where(eq(HashtagMuteRules.id, ruleId));
    const boundary = Temporal.Now.instant();
    await db
      .update(HashtagMuteRules)
      .set({ expiresAt: boundary })
      .where(eq(HashtagMuteRules.id, ruleId));
    t.mock.method(Temporal.Now, 'instant', () => boundary);
    const expired = await queryRule(rule.id, auth.token);
    t.mock.restoreAll();
    assertNoGraphQLErrors(expired);
    assert.equal(expired.data?.node?.isActive, false);
    assert.equal(expired.data?.node?.search, false);
    const snapshot = await db
      .select()
      .from(HashtagMuteRules)
      .where(eq(HashtagMuteRules.id, ruleId));
    for (const changes of [
      { decision: 'EXCLUDE' },
      { scopes: [] },
      { decision: null },
      { scopes: null },
      { scopes: ['HOME'], expiresAt: Temporal.Now.instant().subtract({ seconds: 1 }).toString() },
    ]) {
      const result = await updateResult(auth.token, rule.id, changes);
      assert.equal(result.errors?.[0].extensions?.code, 'VALIDATION');
      assert.deepEqual(
        await db.select().from(HashtagMuteRules).where(eq(HashtagMuteRules.id, ruleId)),
        snapshot,
      );
    }
    const reactivated = await updateResult(auth.token, rule.id, { expiresAt: null });
    assertNoGraphQLErrors(reactivated);
    assert.equal(reactivated.data?.updateHashtagMuteRule.hashtagMuteRule.isActive, true);
    const removed = await deleteResult(auth.token, rule.id);
    assertNoGraphQLErrors(removed);
    assert.equal(removed.data?.deleteHashtagMuteRule.hashtagMuteRuleId, rule.id);
    assert.equal((await queryRule(rule.id, auth.token)).data?.node, null);
    assert.equal(await db.$count(HashtagMuteRules), 0);
    const recreated = await createRule(auth.token, hashtag.id, {
      scopes: ['HOME'],
      decision: 'EXCLUDE',
      expiresAt: null,
    });
    assert.notEqual(recreated.id, rule.id);
  });

  test('같은 Account의 다른 selected Profile과 비인증 요청에 Rule 내용을 노출하지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const hashtag = await createHashtag();
    const rule = await createRule(auth.token, hashtag.id, {
      scopes: ['HOME'],
      decision: 'EXCLUDE',
      expiresAt: null,
    });
    const other = await createProfile({ handle: 'other-owner', instanceId: localInstanceId });
    await db
      .insert(AccountProfiles)
      .values({ accountId: auth.account.id, profileId: other.id, role: AccountProfileRole.MEMBER });
    await db
      .update(Sessions)
      .set({ activeProfileId: other.id })
      .where(eq(Sessions.id, auth.session.id));
    assert.equal((await queryRule(rule.id, auth.token)).data?.node, null);
    assert.equal(
      (await updateResult(auth.token, rule.id, { decision: 'COLLAPSE' })).errors?.[0].extensions
        ?.code,
      'NOT_FOUND',
    );
    assert.equal(
      (await deleteResult(auth.token, rule.id)).errors?.[0].extensions?.code,
      'NOT_FOUND',
    );
    const list = await requestGraphQL(
      `query($id: ID!) { node(id: $id) { ... on Profile { hashtagMuteRules(first: 10) { edges { node { id } } } } } }`,
      { id: globalId('Profile', auth.profile.id) },
      auth.token,
    );
    assert.equal(list.errors?.[0].extensions?.code, 'PERMISSION_DENIED');
    for (const token of [auth.token, undefined]) {
      const viewer = await requestGraphQL<{ node: { viewerMuteRule: Rule | null } }>(
        `query($id: ID!) { node(id: $id) { ... on Hashtag { viewerMuteRule { id } } } }`,
        { id: globalId('Hashtag', hashtag.id) },
        token,
      );
      assertNoGraphQLErrors(viewer);
      assert.equal(viewer.data?.node.viewerMuteRule, null);
    }
    assert.equal((await queryRule(rule.id)).data?.node, null);
    const outsiderRule = await createRule(auth.token, hashtag.id, {
      scopes: ['SEARCH'],
      decision: 'COLLAPSE',
      expiresAt: null,
    });
    assert.notEqual(outsiderRule.id, rule.id);
    assert.equal(await db.$count(HashtagMuteRules), 2);
  });

  test('인증·membership·Local 생성 조건과 잘못된 Node 타입·빈 Scope·만료 입력을 무변경으로 거절한다', async () => {
    const auth = await createAuthenticatedSession(AccountProfileRole.MEMBER);
    const hashtag = await createHashtag();
    const valid = { scopes: ['HOME'], decision: 'EXCLUDE', expiresAt: null };
    for (const input of [
      { ...valid, scopes: [] },
      { ...valid, expiresAt: Temporal.Now.instant().subtract({ seconds: 1 }).toString() },
    ]) {
      assert.equal(
        (await createResult(auth.token, hashtag.id, input)).errors?.[0].extensions?.code,
        'VALIDATION',
      );
    }
    const wrongId = await requestGraphQL(
      createMutation,
      { input: { ...valid, hashtagId: globalId('Profile', auth.profile.id) } },
      auth.token,
    );
    assert.ok(wrongId.errors);
    assert.equal(
      (await createResult(undefined, hashtag.id, valid)).errors?.[0].extensions?.code,
      'PERMISSION_DENIED',
    );
    await db
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(eq(Accounts.id, auth.account.id));
    assert.ok((await createResult(auth.token, hashtag.id, valid)).errors);
    await db
      .update(Accounts)
      .set({ state: AccountState.ACTIVE })
      .where(eq(Accounts.id, auth.account.id));
    for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
      await db.update(Profiles).set({ state }).where(eq(Profiles.id, auth.profile.id));
      assert.ok((await createResult(auth.token, hashtag.id, valid)).errors);
    }
    await db
      .update(Profiles)
      .set({ state: ProfileState.ACTIVE })
      .where(eq(Profiles.id, auth.profile.id));
    const remote = await createRemoteInstance();
    const remoteProfile = await createProfile({ handle: 'remote-actor', instanceId: remote.id });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: remoteProfile.id,
      role: AccountProfileRole.MEMBER,
    });
    await db
      .update(Sessions)
      .set({ activeProfileId: remoteProfile.id })
      .where(eq(Sessions.id, auth.session.id));
    assert.equal(
      (await createResult(auth.token, hashtag.id, valid)).errors?.[0].extensions?.code,
      'PERMISSION_DENIED',
    );
    await db
      .update(Sessions)
      .set({ activeProfileId: auth.profile.id })
      .where(eq(Sessions.id, auth.session.id));
    await db
      .delete(AccountProfiles)
      .where(
        and(
          eq(AccountProfiles.accountId, auth.account.id),
          eq(AccountProfiles.profileId, auth.profile.id),
        ),
      );
    assert.ok((await createResult(auth.token, hashtag.id, valid)).errors);
    assert.equal(await db.$count(HashtagMuteRules), 0);
    assert.equal(await db.$count(HashtagMuteRuleCommands), 0);
  });
});

type Rule = {
  id: string;
  scopes: string[];
  decision: string;
  expiresAt: string | null;
  isActive: boolean;
  home: boolean;
  search: boolean;
  targetHashtag: { id: string };
};
const ruleFields =
  'id scopes decision expiresAt isActive home: appliesTo(scope: HOME) search: appliesTo(scope: SEARCH) targetHashtag { id }';
const createMutation = `mutation($input: CreateHashtagMuteRuleInput!) { createHashtagMuteRule(input: $input) { hashtagMuteRule { ${ruleFields} } } }`;
const createHashtag = () =>
  db
    .insert(Hashtags)
    .values({ name: crypto.randomUUID(), displayName: '주제' })
    .returning()
    .then(firstOrThrow);
const createResult = (
  token: string | undefined,
  hashtagId: string,
  input: Record<string, unknown>,
) =>
  requestGraphQL<{ createHashtagMuteRule: { hashtagMuteRule: Rule } }>(
    createMutation,
    { input: { ...input, hashtagId: globalId('Hashtag', hashtagId) } },
    token,
  );
const createRule = async (token: string, hashtagId: string, input: Record<string, unknown>) => {
  const result = await createResult(token, hashtagId, input);
  assertNoGraphQLErrors(result);
  assert.ok(result.data?.createHashtagMuteRule.hashtagMuteRule);
  return result.data.createHashtagMuteRule.hashtagMuteRule;
};
const updateResult = (token: string, id: string, changes: Record<string, unknown>) =>
  requestGraphQL<{ updateHashtagMuteRule: { hashtagMuteRule: Rule } }>(
    `mutation($input: UpdateHashtagMuteRuleInput!) { updateHashtagMuteRule(input: $input) { hashtagMuteRule { ${ruleFields} } } }`,
    { input: { id, ...changes } },
    token,
  );
const deleteResult = (token: string, id: string) =>
  requestGraphQL<{ deleteHashtagMuteRule: { hashtagMuteRuleId: string } }>(
    'mutation($input: DeleteHashtagMuteRuleInput!) { deleteHashtagMuteRule(input: $input) { hashtagMuteRuleId } }',
    { input: { id } },
    token,
  );
const queryRule = (id: string, token?: string) =>
  requestGraphQL<{ node: Rule | null }>(
    `query($id: ID!) { node(id: $id) { ... on HashtagMuteRule { ${ruleFields} } } }`,
    { id },
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

const createAuthenticatedSession = async (role: AccountProfileRole = AccountProfileRole.OWNER) => {
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
    role,
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
  await db.delete(HashtagMuteRules);
  await db.delete(HashtagMuteRuleCommands);
  await db.delete(Hashtags);
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
