import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { AccountProfiles, Accounts, db, firstOrThrow, pg, Sessions } from '../db';
import { AccountState, SessionState } from '../enums';
import { PermissionDeniedError } from '../error';
import { createOidcSession, revokeCurrentSession } from './session';

after(async () => {
  await pg.end();
});

const createIdentity = () => {
  const suffix = crypto.randomUUID();

  return {
    displayName: `display-${suffix}`,
    oidcSubject: `subject-${suffix}`,
  };
};

const loadAccount = (oidcSubject: string) =>
  db
    .select()
    .from(Accounts)
    .where(eq(Accounts.oidcSubject, oidcSubject))
    .limit(1)
    .then(firstOrThrow);

const loadSessions = (accountId: string) =>
  db.select().from(Sessions).where(eq(Sessions.accountId, accountId));

test('신규 OIDC Account와 ACTIVE Session을 생성한다', async () => {
  const identity = createIdentity();

  const token = await createOidcSession(identity);

  const account = await loadAccount(identity.oidcSubject);
  const sessions = await loadSessions(account.id);
  assert.equal(account.displayName, identity.displayName);
  assert.equal(account.state, AccountState.ACTIVE);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.state, SessionState.ACTIVE);
  assert.equal(sessions[0]?.token, token);
});

test('기존 Active Account는 표시 이름을 갱신하고 새 Session을 생성한다', async () => {
  const identity = createIdentity();
  const account = await db
    .insert(Accounts)
    .values({ ...identity, displayName: 'old display name', state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);

  const token = await createOidcSession(identity);

  assert.equal((await loadAccount(identity.oidcSubject)).displayName, identity.displayName);
  assert.deepEqual(
    (await loadSessions(account.id)).map((session) => ({
      state: session.state,
      token: session.token,
    })),
    [{ state: SessionState.ACTIVE, token }],
  );
});

for (const state of [AccountState.SUSPENDED, AccountState.DISABLED]) {
  test(`${state} Account는 Session을 생성하지 않는다`, async () => {
    const identity = createIdentity();
    const account = await db
      .insert(Accounts)
      .values({ ...identity, displayName: 'preserved display name', state })
      .returning()
      .then(firstOrThrow);

    await assert.rejects(createOidcSession(identity), PermissionDeniedError);

    const persistedAccount = await loadAccount(identity.oidcSubject);
    assert.equal(persistedAccount.displayName, 'preserved display name');
    assert.equal(persistedAccount.state, state);
    assert.deepEqual(await loadSessions(account.id), []);
  });
}

const createFixture = async ({
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
  await db.delete(AccountProfiles).where(inArray(AccountProfiles.accountId, accountIds));
  await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
};

const waitUntilBlockedBy = async (blockingPid: number) => {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const [activity] = await db.execute<{ blocked: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE ${blockingPid} = ANY(pg_blocking_pids(pid))
      ) AS blocked
    `);

    if (activity?.blocked) {
      return;
    }

    await delay(20);
  }

  assert.fail('Session revoke did not wait for the expiration transaction');
};

test('현재 Active Session만 폐기하고 같은 Account의 다른 Session을 보존한다', async () => {
  const { account, session } = await createFixture();
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
    assert.deepEqual(await revokeCurrentSession({ token: session.token }), { status: 'REVOKED' });
    assert.equal(
      (
        await db.select({ state: Sessions.state }).from(Sessions).where(eq(Sessions.id, session.id))
      )[0]?.state,
      SessionState.REVOKED,
    );
    assert.equal(
      (
        await db.select({ state: Sessions.state }).from(Sessions).where(eq(Sessions.id, other.id))
      )[0]?.state,
      SessionState.ACTIVE,
    );
  } finally {
    await cleanup([account.id]);
  }
});

test('Suspended Account의 현재 Session은 폐기하고 Disabled Account는 이미 인증 불가로 처리한다', async () => {
  const suspended = await createFixture({ accountState: AccountState.SUSPENDED });
  const disabled = await createFixture({ accountState: AccountState.DISABLED });

  try {
    assert.deepEqual(await revokeCurrentSession({ token: suspended.session.token }), {
      status: 'REVOKED',
    });
    assert.deepEqual(await revokeCurrentSession({ token: disabled.session.token }), {
      status: 'ALREADY_UNAUTHENTICATED',
    });
    assert.equal(
      (
        await db
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.id, disabled.session.id))
      )[0]?.state,
      SessionState.ACTIVE,
    );
  } finally {
    await cleanup([suspended.account.id, disabled.account.id]);
  }
});

test('Revoked·Expired·missing credential은 terminal 결과를 유지한다', async () => {
  const revoked = await createFixture({ sessionState: SessionState.REVOKED });
  const expired = await createFixture({ sessionState: SessionState.EXPIRED });

  try {
    const results = await Promise.all([
      revokeCurrentSession({ token: revoked.session.token }),
      revokeCurrentSession({ token: expired.session.token }),
      revokeCurrentSession({ token: 'missing-token' }),
      revokeCurrentSession({}),
    ]);
    assert.deepEqual(results, [
      { status: 'ALREADY_UNAUTHENTICATED' },
      { status: 'ALREADY_UNAUTHENTICATED' },
      { status: 'ALREADY_UNAUTHENTICATED' },
      { status: 'ALREADY_UNAUTHENTICATED' },
    ]);
  } finally {
    await cleanup([revoked.account.id, expired.account.id]);
  }
});

test('동시 폐기 요청은 하나의 Revoked terminal 결과로 수렴한다', async () => {
  const { account, session } = await createFixture();

  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => revokeCurrentSession({ token: session.token })),
    );
    assert.ok(
      results.every(({ status }) => status === 'REVOKED' || status === 'ALREADY_UNAUTHENTICATED'),
    );
    assert.equal(
      (
        await db.select({ state: Sessions.state }).from(Sessions).where(eq(Sessions.id, session.id))
      )[0]?.state,
      SessionState.REVOKED,
    );
  } finally {
    await cleanup([account.id]);
  }
});

test('폐기가 Active를 조회한 뒤 만료가 확정돼도 Expired terminal 상태를 보존한다', async () => {
  const { account, session } = await createFixture();
  const expirationLocked = Promise.withResolvers<number>();
  const allowExpiration = Promise.withResolvers<void>();
  const expirationTransaction = db.transaction(async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(
      sql`SELECT pg_backend_pid()::int AS pid`,
    );
    assert.ok(connection);
    await tx
      .select({ id: Sessions.id })
      .from(Sessions)
      .where(eq(Sessions.id, session.id))
      .for('update');
    expirationLocked.resolve(connection.pid);
    await allowExpiration.promise;

    return tx
      .update(Sessions)
      .set({ state: SessionState.EXPIRED })
      .where(and(eq(Sessions.id, session.id), eq(Sessions.state, SessionState.ACTIVE)))
      .returning({ id: Sessions.id });
  });
  let revokeResult: ReturnType<typeof revokeCurrentSession> | undefined;

  try {
    const blockingPid = await Promise.race([
      expirationLocked.promise,
      expirationTransaction.then(() => assert.fail('Expiration transaction ended before locking')),
    ]);
    revokeResult = revokeCurrentSession({ token: session.token });
    await waitUntilBlockedBy(blockingPid);
    allowExpiration.resolve();

    const [revoked, expired] = await Promise.all([revokeResult, expirationTransaction]);
    const finalState = await db
      .select({ state: Sessions.state })
      .from(Sessions)
      .where(eq(Sessions.id, session.id))
      .then((rows) => rows[0]?.state);

    assert.equal(expired.length, 1);
    assert.deepEqual(revoked, { status: 'ALREADY_UNAUTHENTICATED' });
    assert.equal(finalState, SessionState.EXPIRED);
  } finally {
    allowExpiration.resolve();
    await Promise.allSettled([expirationTransaction, ...(revokeResult ? [revokeResult] : [])]);
    await cleanup([account.id]);
  }
});

test('호출 transaction이 rollback되면 Session 폐기도 rollback된다', async () => {
  const { account, session } = await createFixture();

  try {
    await assert.rejects(
      db.transaction(async (tx) => {
        assert.deepEqual(await revokeCurrentSession({ token: session.token }, tx), {
          status: 'REVOKED',
        });
        throw new Error('rollback');
      }),
      /rollback/,
    );
    assert.equal(
      (
        await db.select({ state: Sessions.state }).from(Sessions).where(eq(Sessions.id, session.id))
      )[0]?.state,
      SessionState.ACTIVE,
    );
  } finally {
    await cleanup([account.id]);
  }
});
