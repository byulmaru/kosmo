import { and, eq, sql } from 'drizzle-orm';
import {
  first,
  firstOrThrow,
  getDatabaseConnection,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import type { Transaction } from '../db';

type ProfileFollowInput = {
  readonly createdAt?: Temporal.Instant;
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
  readonly id?: string;
};

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  { followeeProfileId, followerProfileId }: ProfileFollowInput,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

export const ensureProfileFollow = async (input: ProfileFollowInput, tx?: Transaction) =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, input))
      .limit(1)
      .then(first);
    if (existing) {
      await tx.delete(ProfileFollowRequests).where(pairCondition(ProfileFollowRequests, input));
      return { created: false, profileFollow: existing };
    }

    const inserted = await tx
      .insert(ProfileFollows)
      .values(input)
      .onConflictDoNothing({
        target: [ProfileFollows.followerProfileId, ProfileFollows.followeeProfileId],
      })
      .returning()
      .then(first);
    const profileFollow =
      inserted ??
      (await tx
        .select()
        .from(ProfileFollows)
        .where(pairCondition(ProfileFollows, input))
        .limit(1)
        .then(firstOrThrow));
    if (!profileFollow) {
      throw new Error('Profile follow not found after insert conflict');
    }

    await tx.delete(ProfileFollowRequests).where(pairCondition(ProfileFollowRequests, input));

    const created = inserted !== undefined;
    if (created) {
      await tx
        .update(Profiles)
        .set({ followingCount: sql`${Profiles.followingCount} + 1` })
        .where(eq(Profiles.id, input.followerProfileId));
      await tx
        .update(Profiles)
        .set({ followersCount: sql`${Profiles.followersCount} + 1` })
        .where(eq(Profiles.id, input.followeeProfileId));
    }

    return { created, profileFollow };
  });
