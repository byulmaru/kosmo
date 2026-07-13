import { and, desc, eq } from 'drizzle-orm';
import { AccountState, ProfileState, SessionState } from '../enums';
import { AccountProfiles, Accounts, Profiles, Sessions } from './tables';
import { first, firstOrThrow } from './utils';
import type { Database } from './index';

type VerifiedOidcIdentity = {
  displayName: string;
  oidcSubject: string;
};

/**
 * Creates a Kosmo session for an OIDC identity that has already been verified
 * by the caller. Upstream OIDC tokens must not be persisted with the session.
 */
export const createOidcSession = async (
  database: Database,
  { displayName, oidcSubject }: VerifiedOidcIdentity,
) => {
  return database.transaction(async (tx) => {
    const account = await tx
      .insert(Accounts)
      .values({
        displayName,
        oidcSubject,
        state: AccountState.ACTIVE,
      })
      .onConflictDoUpdate({
        target: [Accounts.oidcSubject],
        set: { displayName },
      })
      .returning({ id: Accounts.id })
      .then(firstOrThrow);

    const activeProfile = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(
        AccountProfiles,
        and(eq(AccountProfiles.profileId, Profiles.id), eq(AccountProfiles.accountId, account.id)),
      )
      .where(eq(Profiles.state, ProfileState.ACTIVE))
      .orderBy(desc(Profiles.id))
      .limit(1)
      .then(first);

    return tx
      .insert(Sessions)
      .values({
        accountId: account.id,
        activeProfileId: activeProfile?.id ?? null,
        state: SessionState.ACTIVE,
        token: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
      })
      .returning({ token: Sessions.token })
      .then(firstOrThrow)
      .then((session) => session.token);
  });
};
