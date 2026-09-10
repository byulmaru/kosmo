import { and, eq, or } from 'drizzle-orm';
import { ProfileBlocks } from '../db';
import type { SQLWrapper } from 'drizzle-orm';

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
