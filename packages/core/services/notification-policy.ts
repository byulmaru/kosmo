import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { first, Notifications, ProfileBlocks, ProfileMutes } from '../db';
import { profileBlockPairWhere } from '../visibility/profile-block';
import type { DatabaseHandle } from '../db';
import type { NotificationKind } from '../enums';

type MaterializeNotificationInput = {
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
  { kind, recipientProfileId, relatedProfileId, sourceId }: MaterializeNotificationInput,
): Promise<void> => {
  const profileBlock = await database
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(profileBlockPairWhere(recipientProfileId, relatedProfileId))
    .limit(1)
    .then(first);

  if (profileBlock) {
    return;
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
    return;
  }

  await database
    .insert(Notifications)
    .values({
      data: {},
      kind,
      recipientProfileId,
      sourceId,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    });
};
