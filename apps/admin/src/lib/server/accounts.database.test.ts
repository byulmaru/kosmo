import '@kosmo/core/polyfill';

import { Accounts, db, pg } from '@kosmo/core/db';
import { AccountState } from '@kosmo/core/enums';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { load as loadAccount } from '../../routes/accounts/[id]/+page.server';
import { getAccount, listAccounts } from './accounts';

const fixtureIds = Array.from({ length: 51 }, (_, index) => {
  return `ffffffff-ffff-7000-8000-${String(index + 1).padStart(12, '0')}`;
});
const upperBound = 'ffffffff-ffff-7000-8000-ffffffffffff';

describe('Admin Account read projection', () => {
  beforeAll(async () => {
    await db.insert(Accounts).values(
      fixtureIds.map((id, index) => ({
        id,
        displayName: `Account ${index + 1}`,
        oidcSubject: `subject-${id}`,
        state: AccountState.ACTIVE,
      })),
    );
  });

  afterAll(async () => {
    await db.delete(Accounts).where(inArray(Accounts.id, fixtureIds));
    await pg.end();
  });

  test('returns an explicit list projection ordered by descending Account ID', async () => {
    const page = await listAccounts(upperBound);

    expect(page.accounts).toHaveLength(50);
    expect(page.accounts.map(({ id }) => id)).toEqual(fixtureIds.slice().reverse().slice(0, 50));
    expect(page.accounts[0]).toEqual({
      id: fixtureIds[50],
      displayName: 'Account 51',
      state: AccountState.ACTIVE,
      createdAt: expect.any(String),
    });
    expect(page.accounts.every((account) => !('oidcSubject' in account))).toBe(true);
    expect(page.nextCursor).toBe(fixtureIds[1]);
  });

  test('uses the last list ID as a keyset cursor for the next page', async () => {
    const page = await listAccounts(upperBound);
    const nextPage = await listAccounts(page.nextCursor ?? undefined);

    expect(nextPage.accounts.map(({ id }) => id)).toEqual([fixtureIds[0]]);
    expect(nextPage.previousCursor).toBe(fixtureIds[0]);
    expect(nextPage.nextCursor).toBeNull();

    const previousPage = await listAccounts(nextPage.previousCursor ?? undefined, 'previous');

    expect(previousPage.accounts.map(({ id }) => id)).toEqual(
      fixtureIds.slice().reverse().slice(0, 50),
    );
    expect(previousPage.previousCursor).toBeNull();
    expect(previousPage.nextCursor).toBe(fixtureIds[1]);
  });

  test('returns full OIDC subject only from Account detail and 404s missing IDs', async () => {
    const account = await getAccount(fixtureIds[0]!);

    expect(account).toEqual({
      id: fixtureIds[0],
      displayName: 'Account 1',
      state: AccountState.ACTIVE,
      createdAt: expect.any(String),
      oidcSubject: `subject-${fixtureIds[0]}`,
    });
    expect(await getAccount('00000000-0000-7000-8000-000000000000')).toBeUndefined();

    await expect(
      loadAccount({ params: { id: '00000000-0000-7000-8000-000000000000' } } as Parameters<
        typeof loadAccount
      >[0]),
    ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
  });
});
