import { and, arrayContains, eq, gt, isNull, or, sql } from 'drizzle-orm';
import {
  first,
  HashtagMuteRules,
  Notifications,
  ProfileBlocks,
  ProfileHashtags,
  ProfileMutes,
} from '../db';
import { HashtagMuteScope } from '../enums';
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
 * Materializes a notification after applying the shared profile and tag policy.
 *
 * Mute is recipient-owned and applies while it has no expiry or expires after
 * the database transaction timestamp. Profile Tag mute uses the same recipient
 * ownership and expiry boundary, matching canonical Hashtag identities.
 * Block is pair-owned and applies in either direction. Query errors
 * intentionally propagate so the caller's existing retry boundary can handle
 * an incomplete post-commit projection.
 */
export const materializeNotification = async (
  database: DatabaseHandle,
  { kind, recipientProfileId, relatedProfileId, sourceId }: MaterializeNotificationInput,
): Promise<string | null> => {
  if (await isNotificationSuppressed(database, recipientProfileId, relatedProfileId)) {
    return null;
  }

  const [inserted] = await database
    .insert(Notifications)
    .values({
      data: {},
      kind,
      recipientProfileId,
      sourceId,
    })
    .onConflictDoNothing({
      target: [Notifications.recipientProfileId, Notifications.kind, Notifications.sourceId],
    })
    .returning({ id: Notifications.id });

  if (inserted) {
    return inserted.id;
  }

  return database
    .select({ id: Notifications.id })
    .from(Notifications)
    .where(
      and(
        eq(Notifications.kind, kind),
        eq(Notifications.recipientProfileId, recipientProfileId),
        eq(Notifications.sourceId, sourceId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]?.id ?? null);
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

  const profileTagMute = await database
    .select({ id: HashtagMuteRules.id })
    .from(HashtagMuteRules)
    .innerJoin(ProfileHashtags, eq(HashtagMuteRules.targetHashtagId, ProfileHashtags.hashtagId))
    .where(
      and(
        eq(HashtagMuteRules.ownerProfileId, recipientProfileId),
        eq(ProfileHashtags.profileId, relatedProfileId),
        arrayContains(HashtagMuteRules.scopes, [HashtagMuteScope.NOTIFICATION]),
        or(
          isNull(HashtagMuteRules.expiresAt),
          gt(HashtagMuteRules.expiresAt, sql`CURRENT_TIMESTAMP`),
        ),
      ),
    )
    .limit(1)
    .then(first);

  return Boolean(profileTagMute);
};
