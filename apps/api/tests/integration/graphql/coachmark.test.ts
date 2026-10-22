import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { AccountState, CoachmarkGuide, SessionState } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { eq } from 'drizzle-orm';
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

let AccountCoachmarks: typeof CoreDb.AccountCoachmarks;
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

const guides = Object.values(CoachmarkGuide);

before(async () => {
  process.env.NODE_ENV = 'production';
  ({ AccountCoachmarks, Accounts, db, firstOrThrow, pg, Sessions } =
    await import('@kosmo/core/db'));
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

test('비인증 요청은 Coachmark 기록을 거부한다', async () => {
  const result = await request<unknown>(
    `mutation { recordCoachmarkShown(input: { guide: TIMELINE }) { account { id } } }`,
  );

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
  assert.equal(await db.$count(AccountCoachmarks), 0);
});

test('인증된 Account의 안내 이력은 다른 Account와 격리된다', async () => {
  const first = await createSession();
  const second = await createSession();

  const recorded = await request<{
    recordCoachmarkShown: { account: { id: string; seenCoachmarks: CoachmarkGuide[] } };
  }>(
    `mutation($input: RecordCoachmarkShownInput!) {
      recordCoachmarkShown(input: $input) { account { id seenCoachmarks } }
    }`,
    { input: { guide: CoachmarkGuide.PROFILE } },
    first.token,
  );

  assert.deepEqual(recorded.data?.recordCoachmarkShown.account, {
    id: encodeGlobalId('Account', first.account.id),
    seenCoachmarks: [CoachmarkGuide.PROFILE],
  });
  assert.deepEqual(await readMe(first.token), [CoachmarkGuide.PROFILE]);
  assert.deepEqual(await readMe(second.token), []);

  await db.delete(Sessions).where(eq(Sessions.accountId, first.account.id));
  await db.delete(Accounts).where(eq(Accounts.id, first.account.id));
  assert.equal(await db.$count(AccountCoachmarks), 0);
});

test('안내 종류별 이력을 저장하고 중복 기록에서도 최초 시각을 보존한다', async () => {
  const fixture = await createSession();

  for (const guide of guides) {
    const result = await request<{ recordCoachmarkShown: { account: { id: string } } }>(
      `mutation($input: RecordCoachmarkShownInput!) {
        recordCoachmarkShown(input: $input) { account { id } }
      }`,
      { input: { guide } },
      fixture.token,
    );
    assert.deepEqual(result.data?.recordCoachmarkShown.account, {
      id: encodeGlobalId('Account', fixture.account.id),
    });
  }

  const firstShownAt = Temporal.Instant.from('2020-01-01T00:00:00Z');
  await db
    .update(AccountCoachmarks)
    .set({ firstShownAt })
    .where(eq(AccountCoachmarks.accountId, fixture.account.id));

  const duplicate = await request<{
    recordCoachmarkShown: { account: { seenCoachmarks: CoachmarkGuide[] } };
  }>(
    `mutation($input: RecordCoachmarkShownInput!) {
      recordCoachmarkShown(input: $input) { account { seenCoachmarks } }
    }`,
    { input: { guide: CoachmarkGuide.TIMELINE } },
    fixture.token,
  );

  assert.deepEqual(
    [...(duplicate.data?.recordCoachmarkShown.account.seenCoachmarks ?? [])].sort(),
    [...guides].sort(),
  );
  const stored = await db
    .select()
    .from(AccountCoachmarks)
    .where(eq(AccountCoachmarks.accountId, fixture.account.id));
  assert.equal(stored.length, guides.length);
  assert.equal(
    stored.find(({ guide }) => guide === CoachmarkGuide.TIMELINE)?.firstShownAt.toString(),
    firstShownAt.toString(),
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

const readMe = async (token: string) => {
  const result = await request<{ me: { seenCoachmarks: CoachmarkGuide[] } | null }>(
    'query { me { seenCoachmarks } }',
    undefined,
    token,
  );
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  return result.data?.me?.seenCoachmarks ?? [];
};

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
