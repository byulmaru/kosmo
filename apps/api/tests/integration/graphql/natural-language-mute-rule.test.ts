import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId as globalId } from '@kosmo/core/global-id';
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
let Instances: typeof CoreDb.Instances;
let NaturalLanguageMuteRules: typeof CoreDb.NaturalLanguageMuteRules;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;

type Rule = { id: string; condition: string };
type ProfileWithRules = { id: string; naturalLanguageMuteRules: Rule[] };
type GraphQLErrorResult = { extensions?: { code?: string }; message: string };
type GraphQLResult<TData = Record<string, unknown>> = {
  data?: TData | null;
  errors?: GraphQLErrorResult[];
};

describe('GraphQL Natural Language Mute Rule', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
    process.env.TEMPORAL_NAMESPACE ??= 'test';
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      db,
      firstOrThrow,
      Instances,
      NaturalLanguageMuteRules,
      pg,
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

  test('Member와 Owner가 rule을 생성·변경·삭제하고 같은 조건의 생성은 멱등 처리한다', async () => {
    for (const role of [AccountProfileRole.MEMBER, AccountProfileRole.OWNER]) {
      const auth = await createAuthenticatedSession(role);
      const created = await createResult(auth.token, '  hide spoiler posts  ');
      assertNoGraphQLErrors(created);
      const rule = created.data?.createNaturalLanguageMuteRule.profile.naturalLanguageMuteRules[0];
      assert.ok(rule);
      assert.equal(rule.condition, 'hide spoiler posts');

      const repeatedCreate = await createResult(auth.token, 'hide spoiler posts');
      assertNoGraphQLErrors(repeatedCreate);
      assert.deepEqual(
        repeatedCreate.data?.createNaturalLanguageMuteRule.profile.naturalLanguageMuteRules,
        [rule],
      );

      const conflict = await createResult(auth.token, 'hide unrelated posts');
      assert.equal(conflict.errors?.[0]?.extensions?.code, 'CONFLICT');
      assert.equal(
        await db.$count(
          NaturalLanguageMuteRules,
          eq(NaturalLanguageMuteRules.ownerProfileId, auth.profile.id),
        ),
        1,
      );

      const updated = await updateResult(auth.token, rule.id, 'hide release spoilers');
      assertNoGraphQLErrors(updated);
      assert.deepEqual(
        updated.data?.updateNaturalLanguageMuteRule.profile.naturalLanguageMuteRules,
        [{ id: rule.id, condition: 'hide release spoilers' }],
      );

      const node = await queryRule(rule.id, auth.token);
      assertNoGraphQLErrors(node);
      assert.deepEqual(node.data?.node, { id: rule.id, condition: 'hide release spoilers' });

      const deleted = await deleteResult(auth.token, rule.id);
      assertNoGraphQLErrors(deleted);
      assert.equal(deleted.data?.deleteNaturalLanguageMuteRule.naturalLanguageMuteRuleId, rule.id);
      assert.deepEqual(
        deleted.data?.deleteNaturalLanguageMuteRule.profile.naturalLanguageMuteRules,
        [],
      );

      const repeatedDelete = await deleteResult(auth.token, rule.id);
      assertNoGraphQLErrors(repeatedDelete);
      assert.equal(
        repeatedDelete.data?.deleteNaturalLanguageMuteRule.naturalLanguageMuteRuleId,
        rule.id,
      );

      const replacement = await createResult(auth.token, 'hide spoiler posts');
      assertNoGraphQLErrors(replacement);
      const replacementRules =
        replacement.data?.createNaturalLanguageMuteRule.profile.naturalLanguageMuteRules;
      assert.equal(replacementRules?.length, 1);
      assert.notEqual(replacementRules?.[0]?.id, rule.id);
    }
  });

  test('정규화한 조건은 250개 변경을 허용하고 251개 생성·변경을 거부한다', async () => {
    const auth = await createAuthenticatedSession(AccountProfileRole.MEMBER);
    const accepted = `${'가'.repeat(249)}😀`;
    const acceptedUpdate = `${'나'.repeat(249)}😀`;
    const rejected = `${'가'.repeat(250)}😀`;

    const rejectedCreate = await createResult(auth.token, rejected);
    assert.equal(rejectedCreate.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(
      await db.$count(
        NaturalLanguageMuteRules,
        eq(NaturalLanguageMuteRules.ownerProfileId, auth.profile.id),
      ),
      0,
    );

    const created = await createResult(auth.token, `  ${accepted}  `);
    assertNoGraphQLErrors(created);
    const rule = created.data?.createNaturalLanguageMuteRule.profile.naturalLanguageMuteRules[0];
    assert.ok(rule);
    assert.equal(rule.condition, accepted);

    const updated = await updateResult(auth.token, rule.id, acceptedUpdate);
    assertNoGraphQLErrors(updated);
    assert.deepEqual(updated.data?.updateNaturalLanguageMuteRule.profile.naturalLanguageMuteRules, [
      { id: rule.id, condition: acceptedUpdate },
    ]);

    const rejectedUpdate = await updateResult(auth.token, rule.id, rejected);
    assert.equal(rejectedUpdate.errors?.[0]?.extensions?.code, 'VALIDATION');
    const rows = await db
      .select()
      .from(NaturalLanguageMuteRules)
      .where(eq(NaturalLanguageMuteRules.ownerProfileId, auth.profile.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.condition, acceptedUpdate);
  });

  test('guest와 다른 selected Profile에는 rule Node와 내용이 노출되지 않는다', async () => {
    const auth = await createAuthenticatedSession(AccountProfileRole.MEMBER);
    const created = await createResult(auth.token, 'hide spoilers');
    assertNoGraphQLErrors(created);
    const rule = created.data?.createNaturalLanguageMuteRule.profile.naturalLanguageMuteRules[0];
    assert.ok(rule);

    const guestNode = await queryRule(rule.id);
    assertNoGraphQLErrors(guestNode);
    assert.equal(guestNode.data?.node, null);

    const other = await createProfile(`other-${crypto.randomUUID()}`);
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: other.id,
      role: AccountProfileRole.MEMBER,
    });
    await db
      .update(Sessions)
      .set({ activeProfileId: other.id })
      .where(eq(Sessions.id, auth.session.id));

    const otherProfileNode = await queryRule(rule.id, auth.token);
    assertNoGraphQLErrors(otherProfileNode);
    assert.equal(otherProfileNode.data?.node, null);

    const deniedList = await listProfileRules(auth.profile.id, auth.token);
    assert.equal(deniedList.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    assert.equal(
      (await updateResult(auth.token, rule.id, 'change another Profile rule')).errors?.[0]
        ?.extensions?.code,
      'NOT_FOUND',
    );
    assert.equal(
      (await deleteResult(auth.token, rule.id)).errors?.[0]?.extensions?.code,
      'NOT_FOUND',
    );
  });
});

const ruleFields = 'id condition';
const createMutation = `mutation($input: CreateNaturalLanguageMuteRuleInput!) {
  createNaturalLanguageMuteRule(input: $input) {
    profile { id naturalLanguageMuteRules { ${ruleFields} } }
  }
}`;
const updateMutation = `mutation($input: UpdateNaturalLanguageMuteRuleInput!) {
  updateNaturalLanguageMuteRule(input: $input) {
    profile { id naturalLanguageMuteRules { ${ruleFields} } }
  }
}`;
const deleteMutation = `mutation($input: DeleteNaturalLanguageMuteRuleInput!) {
  deleteNaturalLanguageMuteRule(input: $input) {
    profile { id naturalLanguageMuteRules { ${ruleFields} } }
    naturalLanguageMuteRuleId
  }
}`;

const createResult = (token: string, condition: string) =>
  requestGraphQL<{ createNaturalLanguageMuteRule: { profile: ProfileWithRules } }>(
    createMutation,
    { input: { condition } },
    token,
  );
const updateResult = (token: string, naturalLanguageMuteRuleId: string, condition: string) =>
  requestGraphQL<{ updateNaturalLanguageMuteRule: { profile: ProfileWithRules } }>(
    updateMutation,
    { input: { naturalLanguageMuteRuleId, condition } },
    token,
  );
const deleteResult = (token: string, naturalLanguageMuteRuleId: string) =>
  requestGraphQL<{
    deleteNaturalLanguageMuteRule: {
      naturalLanguageMuteRuleId: string;
      profile: ProfileWithRules;
    };
  }>(deleteMutation, { input: { naturalLanguageMuteRuleId } }, token);
const queryRule = (id: string, token?: string) =>
  requestGraphQL<{ node: Rule | null }>(
    `query($id: ID!) { node(id: $id) { ... on NaturalLanguageMuteRule { ${ruleFields} } } }`,
    { id },
    token,
  );
const listProfileRules = (profileId: string, token: string) =>
  requestGraphQL<{ node: ProfileWithRules | null }>(
    `query($id: ID!) { node(id: $id) { ... on Profile { id naturalLanguageMuteRules { ${ruleFields} } } } }`,
    { id: globalId('Profile', profileId) },
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

const createProfile = (handle: string) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstanceId,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async (role: AccountProfileRole) => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Test Account',
      oidcSubject: `subject-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(`viewer-${crypto.randomUUID()}`);
  await db.insert(AccountProfiles).values({ accountId: account.id, profileId: profile.id, role });
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: profile.id,
      state: SessionState.ACTIVE,
      token: `token-${crypto.randomUUID()}`,
    })
    .returning()
    .then(firstOrThrow);
  return { account, profile, session, token: session.token };
};

const resetFixtures = async () => {
  await db.delete(NaturalLanguageMuteRules);
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
  const database = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(database.hostname));
  assert.match(decodeURIComponent(database.pathname.slice(1)), /^kosmo_test(?:_[a-z0-9_]+)?$/);
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
