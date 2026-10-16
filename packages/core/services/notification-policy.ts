import { and, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { AccountProfiles, first, Notifications, ProfileBlocks, ProfileMutes } from '../db';
import { profileBlockPairWhere } from '../visibility/profile-block';
import type { DatabaseHandle } from '../db';
import type { NotificationKind } from '../enums';

type MaterializeNotificationInput = {
  readonly actorAccountId: string | null;
  readonly kind: NotificationKind;
  readonly recipientProfileId: string;
  readonly relatedProfileId: string;
  readonly sourceId: string;
};

/**
 * Materializes a notification after applying the shared profile-pair policy.
 *
 * Mute is recipient-owned and applies while it has no expiry or expires after
 * the database transaction timestamp. Block is pair-owned and applies in
 * either direction. Query errors intentionally propagate so the caller's
 * existing retry boundary can handle an incomplete post-commit projection.
 */
export const materializeNotification = async (
  database: DatabaseHandle,
  {
    actorAccountId,
    kind,
    recipientProfileId,
    relatedProfileId,
    sourceId,
  }: MaterializeNotificationInput,
): Promise<string[]> => {
  if (await isNotificationSuppressed(database, recipientProfileId, relatedProfileId)) {
    return [];
  }

  const recipientAccountIds = await database
    .select({ id: AccountProfiles.accountId })
    .from(AccountProfiles)
    .where(
      and(
        eq(AccountProfiles.profileId, recipientProfileId),
        actorAccountId === null ? undefined : ne(AccountProfiles.accountId, actorAccountId),
      ),
    )
    .orderBy(AccountProfiles.accountId)
    .then((rows) => rows.map(({ id }) => id));

  if (recipientAccountIds.length === 0) {
    return [];
  }

  await database
    .insert(Notifications)
    .values(
      recipientAccountIds.map((recipientAccountId) => ({
        data: {},
        kind,
        recipientAccountId,
        recipientProfileId,
        sourceId,
      })),
    )
    .onConflictDoNothing();

  return database
    .select({ id: Notifications.id })
    .from(Notifications)
    .where(
      and(
        eq(Notifications.kind, kind),
        eq(Notifications.recipientProfileId, recipientProfileId),
        eq(Notifications.sourceId, sourceId),
        or(
          inArray(Notifications.recipientAccountId, recipientAccountIds),
          isNull(Notifications.recipientAccountId),
        ),
      ),
    )
    .orderBy(Notifications.recipientAccountId, Notifications.id)
    .then((rows) => rows.map(({ id }) => id));
};

export const isNotificationSuppressed = async (
  database: DatabaseHandle,
  recipientProfileId: string,
  relatedProfileId: string,
): Promise<boolean> => {
  const profileBlock = await database
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(profileBlockPairWhere(recipientProfileId, relatedProfileId))
    .limit(1)
    .then(first);

  if (profileBlock) {
    return true;
  }

  const profileMute = await database
    .select({ id: ProfileMutes.id })
    .from(ProfileMutes)
    .where(
      and(
        eq(ProfileMutes.ownerProfileId, recipientProfileId),
        eq(ProfileMutes.targetProfileId, relatedProfileId),
        or(isNull(ProfileMutes.expiresAt), gt(ProfileMutes.expiresAt, sql`CURRENT_TIMESTAMP`)),
      ),
    )
    .limit(1)
    .then(first);

  if (profileMute) {
    return true;
  }

  return false;
};
