import { and, eq, inArray, sql } from 'drizzle-orm';
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

export type AccountDeletionEligibility = {
  readonly canDelete: boolean;
  readonly activeProfileCount: number;
};

export type AccountDeletionResult =
  | { readonly status: 'DELETED'; readonly activeProfileCount: 0 }
  | { readonly status: 'BLOCKED'; readonly activeProfileCount: number }
  | { readonly status: 'ALREADY_DELETED'; readonly activeProfileCount: 0 };

const loadDeletionSession = async (token: string, tx: Transaction) =>
  tx
    .select({
      accountId: Accounts.id,
      accountState: Accounts.state,
      sessionState: Sessions.state,
    })
    .from(Sessions)
    .innerJoin(Accounts, eq(Accounts.id, Sessions.accountId))
    .where(eq(Sessions.token, token))
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

const activeProfileCount = (profiles: ReadonlyArray<{ state: ProfileState }>) =>
  profiles.filter(({ state }) => state !== ProfileState.DISABLED).length;

const requireDeletableSession = async (token: string, tx: Transaction) => {
  const current = await loadDeletionSession(token, tx);
  if (!current) {
    throw new PermissionDeniedError();
  }

  if (current.accountState === AccountState.DISABLED) {
    return { kind: 'ALREADY_DELETED' as const, current };
  }

  if (
    ![AccountState.ACTIVE, AccountState.SUSPENDED].includes(current.accountState) ||
    current.sessionState !== SessionState.ACTIVE
  ) {
    throw new PermissionDeniedError();
  }

  return { kind: 'ACTIVE' as const, current };
};

/**
 * Returns the caller's Kosmo Account deletion eligibility without changing
 * Account, Profile, Membership, or authentication state.
 *
 * The Account and linked Profile rows are locked for the duration of the
 * transaction. Account deletion uses the same lock order, so a concurrent
 * Profile state transition cannot be accepted against a stale eligibility
 * snapshot.
 */
export const getAccountDeletionEligibility = async (
  { token }: { readonly token: string },
  handle?: DatabaseHandle,
): Promise<AccountDeletionEligibility> =>
  getDatabaseConnection(handle).transaction(async (tx) => {
    const session = await requireDeletableSession(token, tx);
    if (session.kind === 'ALREADY_DELETED') {
      throw new PermissionDeniedError();
    }

    const profiles = await loadLinkedProfiles(session.current.accountId, tx);
    const activeCount = activeProfileCount(profiles);
    return { canDelete: activeCount === 0, activeProfileCount: activeCount };
  });

/**
 * Atomically transitions the caller's Account to storage DISABLED and clears
 * the explicitly scoped account-owned Sessions, ApplicationAuthorizations,
 * OAuthTokens, OAuthAuthorizationCodes, and PushInstallations.
 * Profiles, Memberships, and Account attributes are intentionally untouched.
 */
export const deleteAccount = async (
  { token }: { readonly token: string },
  handle?: DatabaseHandle,
): Promise<AccountDeletionResult> =>
  getDatabaseConnection(handle).transaction(async (tx) => {
    const session = await requireDeletableSession(token, tx);
    if (session.kind === 'ALREADY_DELETED') {
      return { status: 'ALREADY_DELETED', activeProfileCount: 0 } as const;
    }

    const profiles = await loadLinkedProfiles(session.current.accountId, tx);
    const activeCount = activeProfileCount(profiles);
    if (activeCount > 0) {
      return { status: 'BLOCKED', activeProfileCount: activeCount } as const;
    }

    const account = await tx
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(
        and(
          eq(Accounts.id, session.current.accountId),
          inArray(Accounts.state, [AccountState.ACTIVE, AccountState.SUSPENDED]),
        ),
      )
      .returning({ id: Accounts.id })
      .then(first);

    if (!account) {
      throw new PermissionDeniedError();
    }

    await tx
      .update(Sessions)
      .set({ state: SessionState.REVOKED })
      .where(
        and(
          eq(Sessions.accountId, session.current.accountId),
          eq(Sessions.state, SessionState.ACTIVE),
        ),
      );

    await tx
      .update(ApplicationAuthorizations)
      .set({ revokedAt: sql`coalesce(${ApplicationAuthorizations.revokedAt}, now())` })
      .where(eq(ApplicationAuthorizations.accountId, session.current.accountId));

    await tx
      .update(OAuthTokens)
      .set({
        revokedAt: sql`coalesce(${OAuthTokens.revokedAt}, now())`,
        state: OAuthTokenState.REVOKED,
      })
      .where(eq(OAuthTokens.accountId, session.current.accountId));

    await tx
      .delete(OAuthAuthorizationCodes)
      .where(eq(OAuthAuthorizationCodes.accountId, session.current.accountId));

    await tx
      .delete(PushInstallations)
      .where(eq(PushInstallations.accountId, session.current.accountId));

    return { status: 'DELETED', activeProfileCount: 0 } as const;
  });
