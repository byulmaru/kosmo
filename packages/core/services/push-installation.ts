import { and, eq, gt, lte, sql } from 'drizzle-orm';
import { validate as validateUuid } from 'uuid';
import {
  AccountProfiles,
  Accounts,
  first,
  getDatabaseConnection,
  isUniqueViolation,
  Notifications,
  Profiles,
  PushInstallations,
  Sessions,
} from '../db';
import { AccountState, ProfileState, SessionState } from '../enums';
import { ConflictError, KosmoError, PermissionDeniedError, ValidationError } from '../error';
import type { DatabaseHandle, Transaction } from '../db';
import type { PushInstallationPlatform } from '../enums';

const maxRegistrationTokenLength = 4096;

type PushInstallationStorageOperation = 'invalidate' | 'register';

const readSafeDatabaseCode = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object' || !('code' in value)) {
    return undefined;
  }

  const code = value.code;
  return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : undefined;
};

const readDatabaseCode = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  return (
    readSafeDatabaseCode(error) ??
    ('cause' in error ? readSafeDatabaseCode(error.cause) : undefined)
  );
};

/**
 * Keeps unexpected database details, including token-bearing query params and
 * driver causes, out of caller-visible errors and error-monitoring events.
 * Known domain errors retain their existing contract and are rethrown intact.
 */
export class PushInstallationStorageError extends Error {
  readonly code = 'PUSH_INSTALLATION_STORAGE_ERROR';
  readonly databaseCode: string | undefined;
  readonly operation: PushInstallationStorageOperation;

  constructor(operation: PushInstallationStorageOperation, error: unknown) {
    super(`Push installation ${operation} failed.`);
    this.name = 'PushInstallationStorageError';
    this.databaseCode = readDatabaseCode(error);
    this.operation = operation;
  }
}

const withSanitizedStorageError = async <T>(
  operation: PushInstallationStorageOperation,
  action: () => Promise<T>,
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof KosmoError) {
      throw error;
    }

    throw new PushInstallationStorageError(operation, error);
  }
};

export type RegisterPushInstallationInput = {
  readonly accountId: string;
  readonly sessionId: string;
  readonly installationId: string;
  readonly platform: PushInstallationPlatform;
  readonly token: string;
};

export type UnregisterPushInstallationInput = {
  readonly accountId: string;
  readonly sessionId: string;
  readonly installationId: string;
};

export type InvalidatePushInstallationInput = {
  readonly accountId: string;
  readonly installationId: string;
  readonly token: string;
};

export type EligiblePushInstallation = {
  readonly accountId: string;
  readonly id: string;
  readonly installationId: string;
  readonly notificationCreatedAt: Temporal.Instant;
  readonly platform: PushInstallationPlatform;
  readonly sessionId: string;
  readonly token: string;
};

const assertInstallationInput = ({
  installationId,
  token,
}: Pick<RegisterPushInstallationInput, 'installationId' | 'token'>) => {
  assertInstallationId(installationId);

  if (token.length === 0 || token.length > maxRegistrationTokenLength) {
    throw new ValidationError('Push registration token is invalid.', { field: 'token' });
  }
};

const assertInstallationId = (installationId: string) => {
  if (!validateUuid(installationId)) {
    throw new ValidationError('Installation ID must be a UUID.', { field: 'installationId' });
  }
};

const assertActiveSession = async ({
  accountId,
  sessionId,
  tx,
}: {
  readonly accountId: string;
  readonly sessionId: string;
  readonly tx: Transaction;
}) => {
  const session = await tx
    .select({ accountState: Accounts.state, sessionState: Sessions.state })
    .from(Sessions)
    .innerJoin(Accounts, eq(Accounts.id, Sessions.accountId))
    .where(and(eq(Sessions.id, sessionId), eq(Sessions.accountId, accountId)))
    .for('update')
    .limit(1)
    .then(first);

  if (
    !session ||
    session.accountState !== AccountState.ACTIVE ||
    session.sessionState !== SessionState.ACTIVE
  ) {
    throw new PermissionDeniedError('An active Account Session is required.');
  }
};

const cleanupSameAccountTokenDuplicate = async ({
  accountId,
  installationId,
  token,
  tx,
}: {
  readonly accountId: string;
  readonly installationId: string;
  readonly token: string;
  readonly tx: Transaction;
}) => {
  const conflict = await tx
    .select({
      accountId: PushInstallations.accountId,
      id: PushInstallations.id,
      installationId: PushInstallations.installationId,
    })
    .from(PushInstallations)
    .where(eq(PushInstallations.token, token))
    .for('update')
    .limit(1)
    .then(first);

  if (!conflict) {
    return false;
  }

  if (conflict.accountId !== accountId) {
    throw new ConflictError({ message: 'Push token belongs to another installation.' });
  }

  if (conflict.installationId === installationId) {
    return false;
  }

  await tx.delete(PushInstallations).where(eq(PushInstallations.id, conflict.id));
  return true;
};

/**
 * Registers an Account-owned app installation for the caller's active Session.
 *
 * `installationId` is the stable client identity. A token refresh updates the
 * same active row without moving `registrationEpoch`, so a refresh cannot
 * replay an existing Notification backlog. A row that was unregistered or
 * invalidated starts a new epoch when it is registered again.
 */
export const registerPushInstallation = async (
  input: RegisterPushInstallationInput,
  database?: DatabaseHandle,
): Promise<void> => {
  assertInstallationInput(input);

  return withSanitizedStorageError('register', () =>
    getDatabaseConnection(database).transaction(async (tx) => {
      await assertActiveSession({ accountId: input.accountId, sessionId: input.sessionId, tx });

      let existing = await tx
        .select()
        .from(PushInstallations)
        .where(eq(PushInstallations.installationId, input.installationId))
        .for('update')
        .then(first);
      let duplicateMoved = false;

      for (;;) {
        const duplicateDeleted = await cleanupSameAccountTokenDuplicate({
          accountId: input.accountId,
          installationId: input.installationId,
          token: input.token,
          tx,
        });
        if (duplicateDeleted) {
          duplicateMoved = true;
          existing = await tx
            .select()
            .from(PushInstallations)
            .where(eq(PushInstallations.installationId, input.installationId))
            .for('update')
            .then(first);
        }

        if (!existing) {
          const inserted = await tx
            .insert(PushInstallations)
            .values({
              accountId: input.accountId,
              installationId: input.installationId,
              platform: input.platform,
              sessionId: input.sessionId,
              token: input.token,
            })
            .onConflictDoNothing()
            .returning({ id: PushInstallations.id });

          if (inserted.length > 0) {
            return;
          }

          existing = await tx
            .select()
            .from(PushInstallations)
            .where(eq(PushInstallations.installationId, input.installationId))
            .for('update')
            .then(first);

          if (!existing) {
            continue;
          }
        }

        if (existing.accountId !== input.accountId) {
          throw new PermissionDeniedError('Push installation belongs to another Account.');
        }

        const previousSessionState = await tx
          .select({ state: Sessions.state })
          .from(Sessions)
          .where(eq(Sessions.id, existing.sessionId))
          .limit(1)
          .then(first);
        const preserveRegistrationEpoch =
          !duplicateMoved && previousSessionState?.state === SessionState.ACTIVE;

        try {
          await tx
            .update(PushInstallations)
            .set({
              accountId: input.accountId,
              platform: input.platform,
              ...(preserveRegistrationEpoch ? {} : { registrationEpoch: sql`now()` }),
              sessionId: input.sessionId,
              token: input.token,
              updatedAt: sql`now()`,
            })
            .where(eq(PushInstallations.id, existing.id));
          return;
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new ConflictError({ message: 'Push token belongs to another installation.' });
          }

          throw error;
        }
      }
    }),
  );
};

/**
 * Idempotently removes an installation from future delivery eligibility.
 * Active rows are session-bound; an active installation cannot be disabled by
 * a different Session of the same Account.
 */
export const unregisterPushInstallation = async (
  input: UnregisterPushInstallationInput,
  database?: DatabaseHandle,
): Promise<void> => {
  assertInstallationId(input.installationId);

  return getDatabaseConnection(database).transaction(async (tx) => {
    await assertActiveSession({ accountId: input.accountId, sessionId: input.sessionId, tx });

    const existing = await tx
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, input.installationId))
      .for('update')
      .then(first);

    if (!existing) {
      return;
    }

    if (existing.accountId !== input.accountId) {
      throw new PermissionDeniedError('Push installation belongs to another Account.');
    }

    if (existing.sessionId !== input.sessionId) {
      throw new PermissionDeniedError('Push installation is bound to another Session.');
    }

    await tx.delete(PushInstallations).where(eq(PushInstallations.id, existing.id));

    return;
  });
};

/**
 * Applies a Provider invalid/unregistered result only to the matching
 * Account-owned token. Matching the token prevents a late result for an old
 * token from invalidating a refreshed token on the same installation.
 */
export const invalidatePushInstallation = async (
  input: InvalidatePushInstallationInput,
  database?: DatabaseHandle,
): Promise<void> => {
  assertInstallationInput(input);

  return withSanitizedStorageError('invalidate', () =>
    getDatabaseConnection(database)
      .delete(PushInstallations)
      .where(
        and(
          eq(PushInstallations.accountId, input.accountId),
          eq(PushInstallations.installationId, input.installationId),
          eq(PushInstallations.token, input.token),
        ),
      )
      .then(() => undefined),
  );
};

/**
 * Finds installation candidates for a committed Notification using registration,
 * AccountProfile/Session eligibility, and the original 24-hour delivery cutoff.
 *
 * The query intentionally does not inspect `Notifications.readAt`: Push
 * delivery is independent from the canonical in-app read state. The
 * registration epoch and original Notification timestamp enforce no-backlog
 * and the 24-hour delivery window at the shared core boundary. PROD-914's
 * delivery owner performs the final Notification body, Mute/Block/visibility,
 * and privacy checks before Provider handoff.
 */
export const findEligiblePushInstallations = async (
  { notificationId }: { readonly notificationId: string },
  database?: DatabaseHandle,
): Promise<EligiblePushInstallation[]> => {
  const expiryCutoff = Temporal.Now.instant().subtract({ hours: 24 });

  return getDatabaseConnection(database)
    .select({
      accountId: PushInstallations.accountId,
      id: PushInstallations.id,
      installationId: PushInstallations.installationId,
      notificationCreatedAt: Notifications.createdAt,
      platform: PushInstallations.platform,
      sessionId: PushInstallations.sessionId,
      token: PushInstallations.token,
    })
    .from(Notifications)
    .innerJoin(Profiles, eq(Profiles.id, Notifications.recipientProfileId))
    .innerJoin(AccountProfiles, eq(AccountProfiles.profileId, Profiles.id))
    .innerJoin(Accounts, eq(Accounts.id, AccountProfiles.accountId))
    .innerJoin(PushInstallations, eq(PushInstallations.accountId, AccountProfiles.accountId))
    .innerJoin(Sessions, eq(Sessions.id, PushInstallations.sessionId))
    .where(
      and(
        eq(Notifications.id, notificationId),
        eq(Profiles.state, ProfileState.ACTIVE),
        eq(Accounts.state, AccountState.ACTIVE),
        eq(Sessions.state, SessionState.ACTIVE),
        lte(PushInstallations.registrationEpoch, Notifications.createdAt),
        gt(Notifications.createdAt, expiryCutoff),
      ),
    )
    .orderBy(PushInstallations.id);
};
