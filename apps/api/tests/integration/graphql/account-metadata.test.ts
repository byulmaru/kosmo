import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = new URL(
  process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test',
);
assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(databaseUrl.hostname));
assert.match(decodeURIComponent(databaseUrl.pathname.slice(1)), /^kosmo_test(?:_[a-z0-9_]+)?$/);
process.env.DATABASE_URL = databaseUrl.toString();

let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let pg: typeof CoreDb.pg;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;

type GraphQLResult<T> = {
  data?: T | null;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

type Metadata = {
  key: string;
  value: string;
};

before(async () => {
  process.env.NODE_ENV = 'production';
  ({ Accounts, db, firstOrThrow, pg, Sessions } = await import('@kosmo/core/db'));
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
  await db.delete(Sessions);
  await db.delete(Accounts);
});

after(async () => {
  await pg.end();
});

test('비인증 요청은 metadata 설정과 조회를 거부한다', async () => {
  const mutation = await request<unknown>(
    `mutation { setAccountMetadata(input: { key: "client.theme", value: "dark" }) { key value account { id } } }`,
  );
  const query = await request<unknown>(
    'query { me { metadata(keys: ["client.theme"]) { key value } } }',
  );

  assert.equal(mutation.data, null);
  assert.equal(mutation.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
  assert.equal((query.data as { me?: unknown } | null | undefined)?.me ?? null, null);
  assert.equal(query.errors, undefined);
});

test('metadata는 현재 Account에만 보이고 Account Node도 다른 Account에서 숨겨진다', async () => {
  const first = await createSession();
  const second = await createSession();
  const updated = await setMetadata(first.token, 'client.theme', 'dark');

  assert.deepEqual(updated, {
    account: {
      id: encodeGlobalId('Account', first.account.id),
      metadata: [{ key: 'client.theme', value: 'dark' }],
    },
    key: 'client.theme',
    value: 'dark',
  });
  assert.equal((await readMetadata(first.token, ['client.theme']))[0]?.value, 'dark');
  assert.deepEqual(await readMetadata(second.token, ['client.theme']), []);

  const ownNode = await request<{ node: { metadata: Metadata[] } | null }>(
    'query($id: ID!) { node(id: $id) { ... on Account { metadata(keys: ["client.theme"]) { key value } } } }',
    { id: encodeGlobalId('Account', first.account.id) },
    first.token,
  );
  assert.equal(ownNode.errors, undefined, JSON.stringify(ownNode.errors));
  assert.deepEqual(ownNode.data?.node?.metadata, [{ key: 'client.theme', value: 'dark' }]);

  const otherNode = await request<{ node: { metadata: Metadata[] } | null }>(
    'query($id: ID!) { node(id: $id) { ... on Account { metadata(keys: ["client.theme"]) { key value } } } }',
    { id: encodeGlobalId('Account', first.account.id) },
    second.token,
  );
  assert.equal(otherNode.errors, undefined, JSON.stringify(otherNode.errors));
  assert.equal(otherNode.data?.node, null);
});

test('generic key/value와 filtered read를 JSONB에 저장한다', async () => {
  const fixture = await createSession();
  assert.deepEqual(await accountMetadataRow(fixture.account.id), {});

  await setMetadata(fixture.token, 'custom.key', '');
  await setMetadata(fixture.token, 'coachmark.timeline.shown', 'true');
  const longUtf8Value = '가'.repeat(1365);
  await setMetadata(fixture.token, 'utf8.value', longUtf8Value);

  const metadata = await readMetadata(fixture.token, ['custom.key', 'missing.key', 'utf8.value']);
  assert.deepEqual(
    metadata.map(({ key, value }) => ({ key, value })),
    [
      { key: 'custom.key', value: '' },
      { key: 'utf8.value', value: longUtf8Value },
    ],
  );
  assert.deepEqual(await readMetadata(fixture.token, ['custom.key', 'custom.key']), [
    { key: 'custom.key', value: '' },
  ]);

  assert.deepEqual(await accountMetadataRow(fixture.account.id), {
    'coachmark.timeline.shown': 'true',
    'custom.key': '',
    'utf8.value': longUtf8Value,
  });
});

test('기존 key는 덮어쓰고 서로 다른 key의 동시 갱신을 보존한다', async () => {
  const fixture = await createSession();
  const first = await setMetadata(fixture.token, 'client.locale', 'ko');
  assert.equal(first.value, 'ko');

  const overwritten = await setMetadata(fixture.token, 'client.locale', 'en');
  assert.deepEqual(overwritten, {
    account: {
      id: encodeGlobalId('Account', fixture.account.id),
      metadata: [{ key: 'client.locale', value: 'en' }],
    },
    key: 'client.locale',
    value: 'en',
  });
  assert.deepEqual(await readMetadata(fixture.token, ['client.locale']), [
    { key: 'client.locale', value: 'en' },
  ]);

  await Promise.all([
    setMetadata(fixture.token, 'race.left', 'left'),
    setMetadata(fixture.token, 'race.right', 'right'),
  ]);
  assert.deepEqual(await readMetadata(fixture.token, ['race.left', 'race.right']), [
    { key: 'race.left', value: 'left' },
    { key: 'race.right', value: 'right' },
  ]);
});

test('key와 value의 승인된 경계를 벗어난 입력을 거부한다', async () => {
  const fixture = await createSession();
  const invalidKeys = ['', '_leading', 'UpperCase', 'a'.repeat(129)];

  for (const key of invalidKeys) {
    await assertValidation(
      `mutation($input: SetAccountMetadataInput!) { setAccountMetadata(input: $input) { key } }`,
      { input: { key, value: 'value' } },
      fixture.token,
    );
  }

  await assertValidation(
    `mutation($input: SetAccountMetadataInput!) { setAccountMetadata(input: $input) { key } }`,
    { input: { key: 'nul.value', value: 'bad\u0000value' } },
    fixture.token,
  );
  await assertValidation(
    `mutation($input: SetAccountMetadataInput!) { setAccountMetadata(input: $input) { key } }`,
    { input: { key: 'too.long', value: '가'.repeat(1366) } },
    fixture.token,
  );

  await assertValidation(
    'query($keys: [String!]!) { me { metadata(keys: $keys) { key } } }',
    { keys: Array.from({ length: 33 }, (_, index) => `key.${index}`) },
    fixture.token,
  );
});

const request = async <T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<GraphQLResult<T>> => {
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
  return (await response.json()) as GraphQLResult<T>;
};

const setMetadata = async (token: string, key: string, value: string) => {
  const result = await request<{
    setAccountMetadata: {
      account: { id: string; metadata: Metadata[] };
      key: string;
      value: string;
    };
  }>(
    `mutation($input: SetAccountMetadataInput!, $key: String!) {
      setAccountMetadata(input: $input) {
        key
        value
        account { id metadata(keys: [$key]) { key value } }
      }
    }`,
    { input: { key, value }, key },
    token,
  );
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  return result.data!.setAccountMetadata;
};

const readMetadata = async (token: string, keys: string[]) => {
  const result = await request<{ me: { metadata: Metadata[] } | null }>(
    'query($keys: [String!]!) { me { metadata(keys: $keys) { key value } } }',
    { keys },
    token,
  );
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  return result.data?.me?.metadata ?? [];
};

const assertValidation = async (
  query: string,
  variables: Record<string, unknown>,
  token: string,
) => {
  const result = await request<unknown>(query, variables, token);
  assert.equal((result.data as { me?: unknown } | null | undefined)?.me ?? null, null);
  assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
};

const accountMetadataRow = async (accountId: string) =>
  db
    .execute(sql`SELECT metadata FROM account WHERE id = ${accountId}`)
    .then(
      (rows) => (rows[0] as { metadata: Record<string, string> } | undefined)?.metadata ?? null,
    );

const createSession = async () => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({
      displayName: suffix,
      oidcSubject: `subject-${suffix}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const token = `token-${suffix}`;
  await db
    .insert(Sessions)
    .values({ accountId: account.id, state: SessionState.ACTIVE, token })
    .returning()
    .then(firstOrThrow);

  return { account, token };
};
