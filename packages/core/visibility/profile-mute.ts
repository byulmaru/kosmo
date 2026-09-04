import { and, eq, exists, isNull, sql } from 'drizzle-orm';
import { ProfileMutes } from '../db';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { DatabaseHandle } from '../db';

/**
 * Checks whether the selected Owner actively mutes the candidate Profile.
 *
 * Consumers decide where this read policy applies and can compose the
 * predicate with their candidate, visibility, and pagination conditions.
 */
export const profileMuteWhere = ({
  db,
  ownerProfileId,
  targetProfileId,
}: {
  readonly db: DatabaseHandle;
  readonly ownerProfileId: SQLWrapper | string;
  readonly targetProfileId: SQLWrapper | string;
}): SQL<boolean> =>
  sql<boolean>`${exists(
    db
      .select({ id: ProfileMutes.id })
      .from(ProfileMutes)
      .where(
        and(
          eq(ProfileMutes.ownerProfileId, ownerProfileId),
          eq(ProfileMutes.targetProfileId, targetProfileId),
          isNull(ProfileMutes.expiresAt),
        ),
      ),
  )}`;
