import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { Accounts, db, firstOrThrow, pg, Sessions } from '../db';
import { AccountState, SessionState } from '../enums';
import { PermissionDeniedError } from '../error';
import { createOidcSession } from './session';

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
