import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  first,
  firstOrThrow,
  getDatabaseConnection,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import type { Transaction } from '../db';

type ProfileFollowPair = {
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
};

export const lockProfileFollowPair = (pair: ProfileFollowPair, tx: Transaction) =>
  tx
    .select({ id: Profiles.id })
    .from(Profiles)
    .where(inArray(Profiles.id, [pair.followerProfileId, pair.followeeProfileId]))
    .orderBy(Profiles.id)
    .for('update', { of: Profiles });

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  { followeeProfileId, followerProfileId }: ProfileFollowPair,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

export const ensureProfileFollow = async (pair: ProfileFollowPair, tx?: Transaction) =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);
    if (existing) {
      await tx.delete(ProfileFollowRequests).where(pairCondition(ProfileFollowRequests, pair));
      return { created: false, profileFollow: existing };
    }

    await lockProfileFollowPair(pair, tx);

    const concurrent = await tx
      .select()
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);
    if (concurrent) {
      await tx.delete(ProfileFollowRequests).where(pairCondition(ProfileFollowRequests, pair));
      return { created: false, profileFollow: concurrent };
    }

    const inserted = await tx
      .insert(ProfileFollows)
      .values(pair)
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
        .where(pairCondition(ProfileFollows, pair))
        .limit(1)
        .then(firstOrThrow));

    await tx.delete(ProfileFollowRequests).where(pairCondition(ProfileFollowRequests, pair));

    const created = inserted !== undefined;
    if (created) {
      await tx
        .update(Profiles)
        .set({ followingCount: sql`${Profiles.followingCount} + 1` })
        .where(eq(Profiles.id, pair.followerProfileId));
      await tx
        .update(Profiles)
        .set({ followersCount: sql`${Profiles.followersCount} + 1` })
        .where(eq(Profiles.id, pair.followeeProfileId));
    }

    return { created, profileFollow };
  });
