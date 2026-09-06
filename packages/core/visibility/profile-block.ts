import { and, eq, notExists, or } from 'drizzle-orm';
import { ProfileBlocks } from '../db';
import type { SQLWrapper } from 'drizzle-orm';
import type { DatabaseHandle } from '../db';

export type ProfileIdExpression = SQLWrapper | string;

/**
 * A Profile Block is directed in storage but symmetric at the visibility
 * boundary. Keep this predicate free of viewer-specific assumptions so the
 * same pair rule can be used for aliases and relation tables.
 */
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

/** Returns the canonical pair visibility condition for a viewer and target. */
export const profileBlockVisibilityWhere = ({
  database,
  firstProfileId,
  secondProfileId,
}: {
  readonly database: DatabaseHandle;
  readonly firstProfileId: ProfileIdExpression;
  readonly secondProfileId: ProfileIdExpression;
}) =>
  notExists(
    database
      .select({ id: ProfileBlocks.id })
      .from(ProfileBlocks)
      .where(profileBlockPairWhere(firstProfileId, secondProfileId)),
  );
