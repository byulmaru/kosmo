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
  id: string;
  key: string;
  value: string;
  createdAt: string;
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

test('비인증 요청은 metadata 생성과 조회를 거부한다', async () => {
  const mutation = await request<unknown>(
    `mutation { createAccountMetadata(input: { key: "client.theme", value: "dark" }) { account { id } } }`,
  );
  const query = await request<unknown>(
    'query { me { metadata(keys: ["client.theme"]) { id key value createdAt } } }',
  );

  assert.equal(mutation.data, null);
  assert.equal(mutation.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
  assert.equal((query.data as { me?: unknown } | null | undefined)?.me ?? null, null);
  assert.equal(query.errors, undefined);
});

test('metadata는 현재 Account에만 보이고 Node도 다른 Account에서 숨겨진다', async () => {
  const first = await createSession();
  const second = await createSession();
  const created = await createMetadata(first.token, 'client.theme', 'dark');

  assert.equal(created.id, encodeGlobalId('Account', first.account.id));
  assert.equal(created.metadata[0]?.key, 'client.theme');
  assert.equal((await readMetadata(first.token, ['client.theme']))[0]?.value, 'dark');
  assert.deepEqual(await readMetadata(second.token, ['client.theme']), []);

  const node = await request<{ node: Metadata | null }>(
    `query($id: ID!) { node(id: $id) { ... on AccountMetadata { id key value createdAt } } }`,
    { id: created.metadata[0]?.id },
    second.token,
  );
  assert.equal(node.errors, undefined, JSON.stringify(node.errors));
  assert.equal(node.data?.node, null);
});

test('generic key/value와 filtered read를 저장하고 Account 삭제 시 cascade한다', async () => {
  const fixture = await createSession();

  await createMetadata(fixture.token, 'custom.key', '');
  await createMetadata(fixture.token, 'coachmark.timeline.shown', 'true');
  const longUtf8Value = '가'.repeat(1365);
  await createMetadata(fixture.token, 'utf8.value', longUtf8Value);

  const metadata = await readMetadata(fixture.token, ['custom.key', 'missing.key', 'utf8.value']);
  assert.deepEqual(
    metadata.map(({ key, value }) => ({ key, value })),
    [
      { key: 'custom.key', value: '' },
      { key: 'utf8.value', value: longUtf8Value },
    ],
  );

  const rows = await metadataRows(fixture.account.id);
  assert.equal(rows.length, 3);

  await db.delete(Sessions).where(sql`account_id = ${fixture.account.id}`);
  await db.delete(Accounts).where(sql`id = ${fixture.account.id}`);
  assert.equal((await metadataRows(fixture.account.id)).length, 0);
});

test('중복 생성은 첫 값과 createdAt을 보존하고 동시 생성도 한 행만 만든다', async () => {
  const fixture = await createSession();
  const first = await createMetadata(fixture.token, 'client.locale', 'ko');
  const firstMetadata = first.metadata[0];
  assert.ok(firstMetadata);

  const duplicate = await createMetadata(fixture.token, 'client.locale', 'en');
  assert.deepEqual(duplicate.metadata[0], firstMetadata);
  assert.deepEqual(await readMetadata(fixture.token, ['client.locale']), [firstMetadata]);

  await Promise.all([
    createMetadata(fixture.token, 'race.key', 'left'),
    createMetadata(fixture.token, 'race.key', 'right'),
  ]);
  const raceRows = await metadataRows(fixture.account.id, 'race.key');
  assert.equal(raceRows.length, 1);
  assert.ok(['left', 'right'].includes(raceRows[0]?.value ?? ''));
});

test('key와 value의 승인된 경계를 벗어난 입력을 거부한다', async () => {
  const fixture = await createSession();
  const invalidKeys = ['', '_leading', 'UpperCase', 'a'.repeat(129)];

  for (const key of invalidKeys) {
    await assertValidation(
      `mutation($input: CreateAccountMetadataInput!) { createAccountMetadata(input: $input) { account { id } } }`,
      { input: { key, value: 'value' } },
      fixture.token,
    );
  }

  await assertValidation(
    `mutation($input: CreateAccountMetadataInput!) { createAccountMetadata(input: $input) { account { id } } }`,
    { input: { key: 'nul.value', value: 'bad\u0000value' } },
    fixture.token,
  );
  await assertValidation(
    `mutation($input: CreateAccountMetadataInput!) { createAccountMetadata(input: $input) { account { id } } }`,
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

const createMetadata = async (token: string, key: string, value: string) => {
  const result = await request<{
    createAccountMetadata: { account: { id: string; metadata: Metadata[] } };
  }>(
    `mutation($input: CreateAccountMetadataInput!, $key: String!) {
      createAccountMetadata(input: $input) {
        account { id metadata(keys: [$key]) { id key value createdAt } }
      }
    }`,
    { input: { key, value }, key },
    token,
  );
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  return result.data!.createAccountMetadata.account;
};

const readMetadata = async (token: string, keys: string[]) => {
  const result = await request<{ me: { metadata: Metadata[] } | null }>(
    'query($keys: [String!]!) { me { metadata(keys: $keys) { id key value createdAt } } }',
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

const metadataRows = async (accountId: string, key?: string) =>
  db.execute(
    key
      ? sql`SELECT id, key, value, created_at AS "createdAt" FROM account_metadata WHERE account_id = ${accountId} AND key = ${key}`
      : sql`SELECT id, key, value, created_at AS "createdAt" FROM account_metadata WHERE account_id = ${accountId}`,
  ) as Promise<Array<{ id: string; key: string; value: string; createdAt: unknown }>>;

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
