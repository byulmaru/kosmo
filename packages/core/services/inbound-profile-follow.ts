import { and, eq, sql } from 'drizzle-orm';
import {
  first,
  getDatabaseConnection,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import type { Transaction } from '../db';

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  followerProfileId: string,
  followeeProfileId: string,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

export const removeInboundFollow = async (
  {
    expectedRowId,
    followeeProfileId,
    followerProfileId,
  }: {
    readonly expectedRowId?: string;
    readonly followeeProfileId: string;
    readonly followerProfileId: string;
  },
  tx?: Transaction,
): Promise<boolean> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const profileFollow = await tx
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
      .limit(1)
      .then(first);

    if (profileFollow) {
      if (expectedRowId !== undefined && profileFollow.id !== expectedRowId) {
        return false;
      }

      const deleted = await tx
        .delete(ProfileFollows)
        .where(eq(ProfileFollows.id, profileFollow.id))
        .returning({ id: ProfileFollows.id })
        .then(first);

      if (!deleted) {
        return false;
      }

      await tx
        .update(Profiles)
        .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
        .where(eq(Profiles.id, followerProfileId));
      await tx
        .update(Profiles)
        .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
        .where(eq(Profiles.id, followeeProfileId));

      return true;
    }

    const profileFollowRequest = await tx
      .select({ id: ProfileFollowRequests.id })
      .from(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId))
      .limit(1)
      .then(first);

    if (!profileFollowRequest) {
      return false;
    }

    if (expectedRowId !== undefined && profileFollowRequest.id !== expectedRowId) {
      return false;
    }

    const deleted = await tx
      .delete(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, profileFollowRequest.id))
      .returning({ id: ProfileFollowRequests.id })
      .then(first);

    return deleted !== undefined;
  });
