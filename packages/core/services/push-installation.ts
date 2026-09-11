import { and, eq, gt, lte, sql } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  db,
  first,
  isUniqueViolation,
  Notifications,
  Profiles,
  PushInstallations,
  Sessions,
} from '../db';
import { AccountState, ProfileState, SessionState } from '../enums';
import { ConflictError, KosmoError, PermissionDeniedError } from '../error';
import type { PushInstallationPlatform } from '../enums';

/**
 * Registers an Account-owned app installation for the caller's active Session.
 *
 * `installationId` is the stable client identity. A token refresh updates the
 * same active row without moving `registrationEpoch`, so a refresh cannot
 * replay an existing Notification backlog. A row that was unregistered or
 * invalidated starts a new epoch when it is registered again.
 */
export const registerPushInstallation = async (input: {
  readonly accountId: string;
  readonly sessionId: string;
  readonly installationId: string;
  readonly platform: PushInstallationPlatform;
  readonly token: string;
}): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      let existing = await tx
        .select()
        .from(PushInstallations)
        .where(eq(PushInstallations.installationId, input.installationId))
        .then(first);
      let duplicateMoved = false;

      const conflict = await tx
        .select({
          accountId: PushInstallations.accountId,
          id: PushInstallations.id,
          installationId: PushInstallations.installationId,
        })
        .from(PushInstallations)
        .where(eq(PushInstallations.token, input.token))
        .limit(1)
        .then(first);
      if (conflict && conflict.installationId !== input.installationId) {
        if (conflict.accountId !== input.accountId) {
          throw new ConflictError({ message: 'Push token belongs to another installation.' });
        }

        await tx.delete(PushInstallations).where(eq(PushInstallations.id, conflict.id));
        duplicateMoved = true;
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
          .onConflictDoNothing({ target: PushInstallations.installationId })
          .returning({ id: PushInstallations.id });

        if (inserted.length > 0) {
          return;
        }

        existing = await tx
          .select()
          .from(PushInstallations)
          .where(eq(PushInstallations.installationId, input.installationId))
          .then(first);
      }

      if (!existing) {
        throw new Error('Push installation disappeared during registration.');
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

      await tx
        .update(PushInstallations)
        .set({
          platform: input.platform,
          ...(preserveRegistrationEpoch ? {} : { registrationEpoch: sql`now()` }),
          sessionId: input.sessionId,
          token: input.token,
          updatedAt: sql`now()`,
        })
        .where(eq(PushInstallations.id, existing.id));
    });
  } catch (error) {
    if (error instanceof KosmoError) {
      throw error;
    }

    if (isUniqueViolation(error)) {
      throw new ConflictError({ message: 'Push token belongs to another installation.' });
    }

    throw new Error('Push installation register failed.');
  }
};

/**
 * Idempotently removes an installation from future delivery eligibility.
 * Active rows are session-bound; an active installation cannot be disabled by
 * a different Session of the same Account.
 */
export const unregisterPushInstallation = async (input: {
  readonly accountId: string;
  readonly sessionId: string;
  readonly installationId: string;
}): Promise<void> => {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, input.installationId))
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
  });
};

/**
 * Applies a Provider invalid/unregistered result only to the matching
 * Account-owned token. Matching the token prevents a late result for an old
 * token from invalidating a refreshed token on the same installation.
 */
export const invalidatePushInstallation = async (input: {
  readonly accountId: string;
  readonly installationId: string;
  readonly token: string;
}): Promise<void> => {
  try {
    await db
      .delete(PushInstallations)
      .where(
        and(
          eq(PushInstallations.accountId, input.accountId),
          eq(PushInstallations.installationId, input.installationId),
          eq(PushInstallations.token, input.token),
        ),
      );
  } catch (error) {
    if (error instanceof KosmoError) {
      throw error;
    }

    throw new Error('Push installation invalidate failed.');
  }
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
export const findEligiblePushInstallations = async ({
  notificationId,
}: {
  readonly notificationId: string;
}) => {
  const expiryCutoff = Temporal.Now.instant().subtract({ hours: 24 });

  return db
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
