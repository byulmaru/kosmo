import { and, eq, isNull } from 'drizzle-orm';
import { first, ProfileBlocks, ProfileMutes } from '../db';
import { profileBlockPairWhere } from '../visibility/profile-block';
import type { DatabaseHandle } from '../db';

type NotificationProfilePolicyInput = {
  readonly recipientProfileId: string;
  readonly relatedProfileId: string;
};

/**
 * Returns whether a notification may be materialized for a profile pair.
 *
 * Mute is recipient-owned and only a permanent row applies to notification
 * creation. Block is pair-owned and applies in either direction. Query errors
 * intentionally propagate so the caller's existing retry boundary can handle
 * an incomplete post-commit projection.
 */
export const isNotificationProfileEligible = async (
  database: DatabaseHandle,
  { recipientProfileId, relatedProfileId }: NotificationProfilePolicyInput,
): Promise<boolean> => {
  const profileBlock = await database
    .select({ id: ProfileBlocks.id })
    .from(ProfileBlocks)
    .where(profileBlockPairWhere(recipientProfileId, relatedProfileId))
    .limit(1)
    .then(first);

  if (profileBlock) {
    return false;
  }

  const profileMute = await database
    .select({ id: ProfileMutes.id })
    .from(ProfileMutes)
    .where(
      and(
        eq(ProfileMutes.ownerProfileId, recipientProfileId),
        eq(ProfileMutes.targetProfileId, relatedProfileId),
        isNull(ProfileMutes.expiresAt),
      ),
    )
    .limit(1)
    .then(first);

  return profileMute === undefined;
};
