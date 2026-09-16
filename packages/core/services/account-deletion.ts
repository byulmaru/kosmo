import { and, eq, sql } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  ApplicationAuthorizations,
  first,
  getDatabaseConnection,
  OAuthAuthorizationCodes,
  OAuthTokens,
  Profiles,
  PushInstallations,
  Sessions,
} from '../db';
import { AccountState, OAuthTokenState, ProfileState, SessionState } from '../enums';
import { PermissionDeniedError } from '../error';
import type { DatabaseHandle, Transaction } from '../db';

export type AccountDeletionResult = { readonly status: 'DELETED' } | { readonly status: 'BLOCKED' };

const loadDeletionAccount = async (accountId: string, tx: Transaction) =>
  tx
    .select({
      accountState: Accounts.state,
    })
    .from(Accounts)
    .where(eq(Accounts.id, accountId))
    .limit(1)
    .for('update')
    .then(first);

const loadLinkedProfiles = (accountId: string, tx: Transaction) =>
  tx
    .select({ state: Profiles.state })
    .from(AccountProfiles)
    .innerJoin(Profiles, eq(Profiles.id, AccountProfiles.profileId))
    .where(eq(AccountProfiles.accountId, accountId))
    .orderBy(Profiles.id)
    .for('update');

const requireDeletableAccount = async (accountId: string, tx: Transaction) => {
  const account = await loadDeletionAccount(accountId, tx);
  if (!account) {
    throw new PermissionDeniedError();
  }

  if (account.accountState !== AccountState.ACTIVE) {
    throw new PermissionDeniedError();
  }
};

/**
 * Atomically transitions the caller's Account to storage DISABLED and clears
 * the explicitly scoped account-owned Sessions, ApplicationAuthorizations,
 * OAuthTokens, OAuthAuthorizationCodes, and PushInstallations.
 * Profiles, Memberships, and Account attributes are intentionally untouched.
 */
export const deleteAccount = async (
  { accountId }: { readonly accountId: string },
  handle?: DatabaseHandle,
): Promise<AccountDeletionResult> =>
  getDatabaseConnection(handle).transaction(async (tx) => {
    await requireDeletableAccount(accountId, tx);

    const profiles = await loadLinkedProfiles(accountId, tx);
    if (profiles.some(({ state }) => state !== ProfileState.DISABLED)) {
      return { status: 'BLOCKED' } as const;
    }

    const deletedAccount = await tx
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(and(eq(Accounts.id, accountId), eq(Accounts.state, AccountState.ACTIVE)))
      .returning({ id: Accounts.id })
      .then(first);

    if (!deletedAccount) {
      throw new PermissionDeniedError();
    }

    await tx
      .update(Sessions)
      .set({ state: SessionState.REVOKED })
      .where(and(eq(Sessions.accountId, accountId), eq(Sessions.state, SessionState.ACTIVE)));

    await tx
      .update(ApplicationAuthorizations)
      .set({ revokedAt: sql`coalesce(${ApplicationAuthorizations.revokedAt}, now())` })
      .where(eq(ApplicationAuthorizations.accountId, accountId));

    await tx
      .update(OAuthTokens)
      .set({
        revokedAt: sql`coalesce(${OAuthTokens.revokedAt}, now())`,
        state: OAuthTokenState.REVOKED,
      })
      .where(eq(OAuthTokens.accountId, accountId));

    await tx
      .delete(OAuthAuthorizationCodes)
      .where(eq(OAuthAuthorizationCodes.accountId, accountId));

    await tx.delete(PushInstallations).where(eq(PushInstallations.accountId, accountId));

    return { status: 'DELETED' } as const;
  });
