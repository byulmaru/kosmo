import { and, eq, notExists, or } from 'drizzle-orm';
import { ProfileBlocks } from '../db';
import type { SQLWrapper } from 'drizzle-orm';
import type { DatabaseHandle } from '../db';

export type ProfileIdExpression = SQLWrapper | string;

/** Matches a stored Block in either direction for pair-level state changes. */
export const profileBlockPairWhere = (
  firstProfileId: ProfileIdExpression,
  secondProfileId: ProfileIdExpression,
) =>
  or(
    and(
      eq(ProfileBlocks.ownerProfileId, firstProfileId),
      eq(ProfileBlocks.targetProfileId, secondProfileId),
    ),
    and(
      eq(ProfileBlocks.ownerProfileId, secondProfileId),
      eq(ProfileBlocks.targetProfileId, firstProfileId),
    ),
  )!;

/** Returns visibility for one stored Block direction: owner -> target. */
export const profileBlockVisibilityWhere = ({
  database,
  ownerProfileId,
  targetProfileId,
}: {
  readonly database: DatabaseHandle;
  readonly ownerProfileId: ProfileIdExpression;
  readonly targetProfileId: ProfileIdExpression;
}) =>
  notExists(
    database
      .select({ id: ProfileBlocks.id })
      .from(ProfileBlocks)
      .where(
        and(
          eq(ProfileBlocks.ownerProfileId, ownerProfileId),
          eq(ProfileBlocks.targetProfileId, targetProfileId),
        ),
      ),
  );
