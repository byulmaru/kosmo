import {
  AccountProfiles,
  Accounts,
  ApplicationAuthorizations,
  db,
  first,
  OAuthAuthorizationCodes,
  OAuthTokens,
  Profiles,
  PushInstallations,
  Sessions,
} from '@kosmo/core/db';
import { AccountState, OAuthTokenState, ProfileState, SessionState } from '@kosmo/core/enums';
import { ApplicationFailure } from '@temporalio/activity';
import { and, eq, sql } from 'drizzle-orm';
import type { AccountDeletionInput } from '@kosmo/core/temporal/workflows';

export const deleteAccountActivity = async ({
  accountId,
}: AccountDeletionInput): Promise<boolean> =>
  db.transaction(async (tx) => {
    const account = await tx
      .select({ state: Accounts.state })
      .from(Accounts)
      .where(eq(Accounts.id, accountId))
      .limit(1)
      .for('update')
      .then(first);

    if (!account) {
      throw ApplicationFailure.nonRetryable('Account not found', 'NotFoundError');
    }

    if (account.state === AccountState.ACTIVE) {
      const profiles = await tx
        .select({ state: Profiles.state })
        .from(AccountProfiles)
        .innerJoin(Profiles, eq(Profiles.id, AccountProfiles.profileId))
        .where(eq(AccountProfiles.accountId, accountId))
        .orderBy(Profiles.id)
        .for('update');

      if (profiles.some(({ state }) => state !== ProfileState.DISABLED)) {
        return false;
      }

      const deletedAccount = await tx
        .update(Accounts)
        .set({ state: AccountState.DISABLED })
        .where(and(eq(Accounts.id, accountId), eq(Accounts.state, AccountState.ACTIVE)))
        .returning({ id: Accounts.id })
        .then(first);

      if (!deletedAccount) {
        throw ApplicationFailure.nonRetryable('Account cannot be deleted', 'PermissionDeniedError');
      }
    } else if (account.state !== AccountState.DISABLED) {
      throw ApplicationFailure.nonRetryable('Account cannot be deleted', 'PermissionDeniedError');
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

    return true;
  });
