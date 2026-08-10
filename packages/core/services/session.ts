import { and, desc, eq } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  first,
  firstOrThrow,
  getDatabaseConnection,
  Profiles,
  Sessions,
} from '../db';
import { AccountState, ProfileState, SessionState } from '../enums';
import { PermissionDeniedError } from '../error';
import type { DatabaseHandle, Transaction } from '../db';

type VerifiedOidcIdentity = {
  displayName: string;
  oidcSubject: string;
};

export type RevokeCurrentSessionResult =
  | { readonly status: 'REVOKED' }
  | { readonly status: 'ALREADY_UNAUTHENTICATED' };

type CurrentSessionState = {
  readonly accountState: AccountState;
  readonly id: string;
  readonly state: SessionState;
};

const loadCurrentSession = async (token: string, tx: Transaction) =>
  tx
    .select({
      accountState: Accounts.state,
      id: Sessions.id,
      state: Sessions.state,
    })
    .from(Sessions)
    .innerJoin(Accounts, eq(Accounts.id, Sessions.accountId))
    .where(eq(Sessions.token, token))
    .limit(1)
    .then((rows) => rows[0] as CurrentSessionState | undefined);

/**
 * Revokes the Session identified by a caller-owned credential.
 *
 * Unlike ordinary authenticated actions, logout must classify missing and
 * terminal credentials as settled outcomes without first producing a verified
 * Session identity. Keeping that lookup in this shared action also prevents
 * GraphQL and Web transports from implementing different terminal-state rules,
 * so this action intentionally accepts a raw Kosmo Session credential.
 *
 * Missing, disabled-account, revoked, and expired credentials are already
 * unauthenticated outcomes. Active Sessions on active or suspended Accounts
 * are revoked with a conditional update so a terminal concurrent winner is
 * never changed back to Active.
 */
export const revokeCurrentSession = async (
  { token }: { readonly token?: string },
  tx?: DatabaseHandle,
): Promise<RevokeCurrentSessionResult> => {
  if (!token) {
    return { status: 'ALREADY_UNAUTHENTICATED' };
  }

  return getDatabaseConnection(tx).transaction(async (transaction) => {
    const current = await loadCurrentSession(token, transaction);
    if (
      !current ||
      current.accountState === AccountState.DISABLED ||
      current.state !== SessionState.ACTIVE
    ) {
      return { status: 'ALREADY_UNAUTHENTICATED' } as const;
    }

    const revoked = await transaction
      .update(Sessions)
      .set({ state: SessionState.REVOKED })
      .where(and(eq(Sessions.id, current.id), eq(Sessions.state, SessionState.ACTIVE)))
      .returning({ id: Sessions.id })
      .then((rows) => rows[0]);

    if (revoked) {
      return { status: 'REVOKED' } as const;
    }

    const settled = await loadCurrentSession(token, transaction);
    if (
      !settled ||
      settled.accountState === AccountState.DISABLED ||
      settled.state !== SessionState.ACTIVE
    ) {
      return { status: 'ALREADY_UNAUTHENTICATED' } as const;
    }

    throw new Error('Current Session revoke did not settle');
  });
};

/**
 * Creates a Kosmo session for an OIDC identity that has already been verified
 * by the caller. Upstream OIDC tokens must not be persisted with the session.
 */
export const createOidcSession = async (
  { displayName, oidcSubject }: VerifiedOidcIdentity,
  tx?: DatabaseHandle,
) => {
  return getDatabaseConnection(tx).transaction(async (tx) => {
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
      .returning({ id: Accounts.id, state: Accounts.state })
      .then(firstOrThrow);

    if (account.state !== AccountState.ACTIVE) {
      throw new PermissionDeniedError();
    }

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
