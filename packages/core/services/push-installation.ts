import { and, eq, gt, lte } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  db,
  Notifications,
  Profiles,
  PushInstallations,
  Sessions,
} from '../db';
import { AccountState, ProfileState, SessionState } from '../enums';
import { KosmoError } from '../error';

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
