import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;

let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let pg: typeof CoreDb.pg;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;

type GraphQLResult<T> = {
  data?: T;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
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

after(async () => {
  await pg.end();
});

const createSession = async ({
  accountState = AccountState.ACTIVE,
  sessionState = SessionState.ACTIVE,
}: {
  accountState?: AccountState;
  sessionState?: SessionState;
} = {}) => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: accountState })
    .returning()
    .then(firstOrThrow);
  const session = await db
    .insert(Sessions)
    .values({ accountId: account.id, state: sessionState, token: `token-${suffix}` })
    .returning()
    .then(firstOrThrow);
  return { account, session };
};

const cleanup = async (accountIds: string[]) => {
  await db.delete(Sessions).where(inArray(Sessions.accountId, accountIds));
  await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
};

const request = async <T>(query: string, token?: string): Promise<GraphQLResult<T>> => {
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query }),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    method: 'POST',
  });
  return response.json() as Promise<GraphQLResult<T>>;
};

const revoke = (token?: string) =>
  request<{ revokeCurrentSession: { completed: boolean } }>(
    'mutation { revokeCurrentSession { completed } }',
    token,
  );

test('Active·Suspended current Session을 폐기하고 재사용 인증을 거부한다', async () => {
  const active = await createSession();
  const suspended = await createSession({ accountState: AccountState.SUSPENDED });

  try {
    assert.deepEqual(await revoke(active.session.token), {
      data: { revokeCurrentSession: { completed: true } },
    });
    assert.deepEqual(await revoke(suspended.session.token), {
      data: { revokeCurrentSession: { completed: true } },
    });

    const [activeState, suspendedState] = await Promise.all([
      db.select({ state: Sessions.state }).from(Sessions).where(eq(Sessions.id, active.session.id)),
      db
        .select({ state: Sessions.state })
        .from(Sessions)
        .where(eq(Sessions.id, suspended.session.id)),
    ]);
    assert.equal(activeState[0]?.state, SessionState.REVOKED);
    assert.equal(suspendedState[0]?.state, SessionState.REVOKED);

    const current = await request<{ currentSession: null }>(
      'query { currentSession { id } }',
      active.session.token,
    );
    assert.deepEqual(current.data, { currentSession: null });
  } finally {
    await cleanup([active.account.id, suspended.account.id]);
  }
});

test('Disabled·Revoked·Expired credential은 완료로 처리하되 상태를 재활성화하지 않는다', async () => {
  const disabled = await createSession({ accountState: AccountState.DISABLED });
  const revoked = await createSession({ sessionState: SessionState.REVOKED });
  const expired = await createSession({ sessionState: SessionState.EXPIRED });

  try {
    const results = await Promise.all([
      revoke(disabled.session.token),
      revoke(revoked.session.token),
      revoke(expired.session.token),
      revoke(),
    ]);
    results.forEach((result) => {
      assert.deepEqual(result, { data: { revokeCurrentSession: { completed: true } } });
    });

    const states = await db
      .select({ id: Sessions.id, state: Sessions.state })
      .from(Sessions)
      .where(eq(Sessions.accountId, disabled.account.id));
    assert.equal(states[0]?.state, SessionState.ACTIVE);
  } finally {
    await cleanup([disabled.account.id, revoked.account.id, expired.account.id]);
  }
});

test('GraphQL mutation에는 Session ID 입력이 없고 malformed Authorization은 거부한다', async () => {
  const malformed = await app.request('/graphql', {
    body: JSON.stringify({ query: 'mutation { revokeCurrentSession { completed } }' }),
    headers: { authorization: 'Basic invalid', 'content-type': 'application/json' },
    method: 'POST',
  });
  const result = (await malformed.json()) as GraphQLResult<unknown>;

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
  assert.match(result.errors?.[0]?.message ?? '', /Bearer/);
});

test('database 결과를 확정할 수 없으면 완료 payload 대신 internal error를 반환한다', async (t) => {
  t.mock.method(db, 'transaction', async () => {
    throw new Error('database unavailable');
  });

  const result = await revoke('unreachable-token');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.extensions?.code, 'INTERNAL_SERVER_ERROR');
});

test('동시 GraphQL 폐기는 한 Session만 Revoked로 수렴한다', async () => {
  const { account, session } = await createSession();
  const other = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      state: SessionState.ACTIVE,
      token: `other-${crypto.randomUUID()}`,
    })
    .returning()
    .then(firstOrThrow);

  try {
    const results = await Promise.all(Array.from({ length: 6 }, () => revoke(session.token)));
    results.forEach((result) => {
      assert.deepEqual(result, { data: { revokeCurrentSession: { completed: true } } });
    });
    const states = await db
      .select({ id: Sessions.id, state: Sessions.state })
      .from(Sessions)
      .where(eq(Sessions.accountId, account.id));
    assert.equal(states.find(({ id }) => id === session.id)?.state, SessionState.REVOKED);
    assert.equal(states.find(({ id }) => id === other.id)?.state, SessionState.ACTIVE);
  } finally {
    await cleanup([account.id]);
  }
});
