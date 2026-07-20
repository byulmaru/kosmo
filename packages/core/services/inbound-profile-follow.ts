import { and, eq, inArray, ne, notExists, or, sql } from 'drizzle-orm';
import {
  first,
  getDatabaseConnection,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceState, NotificationKind, ProfileState } from '../enums';
import { deleteNotificationBySource } from './notification';
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
): Promise<boolean> => {
  const result: {
    readonly profileFollowId: string | null;
    readonly removed: boolean;
  } = await getDatabaseConnection(tx).transaction(async (tx) => {
    const unavailableParticipants = tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          inArray(Profiles.id, [followerProfileId, followeeProfileId]),
          or(ne(Profiles.state, ProfileState.ACTIVE), eq(Instances.state, InstanceState.SUSPENDED)),
        ),
      );
    const profileFollow = await tx
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
      .limit(1)
      .then(first);

    if (profileFollow) {
      if (expectedRowId !== undefined && profileFollow.id !== expectedRowId) {
        return { profileFollowId: null, removed: false };
      }

      const deleted = await tx
        .delete(ProfileFollows)
        .where(and(eq(ProfileFollows.id, profileFollow.id), notExists(unavailableParticipants)))
        .returning({ id: ProfileFollows.id })
        .then(first);

      if (!deleted) {
        return { profileFollowId: null, removed: false };
      }

      await tx
        .update(Profiles)
        .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
        .where(eq(Profiles.id, followerProfileId));
      await tx
        .update(Profiles)
        .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
        .where(eq(Profiles.id, followeeProfileId));

      return { profileFollowId: deleted.id, removed: true };
    }

    const profileFollowRequest = await tx
      .select({ id: ProfileFollowRequests.id })
      .from(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId))
      .limit(1)
      .then(first);

    if (!profileFollowRequest) {
      return { profileFollowId: null, removed: false };
    }

    if (expectedRowId !== undefined && profileFollowRequest.id !== expectedRowId) {
      return { profileFollowId: null, removed: false };
    }

    const deleted = await tx
      .delete(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.id, profileFollowRequest.id),
          notExists(unavailableParticipants),
        ),
      )
      .returning({ id: ProfileFollowRequests.id })
      .then(first);

    return { profileFollowId: null, removed: deleted !== undefined };
  });

  if (result.profileFollowId) {
    await deleteNotificationBySource(NotificationKind.FOLLOW, result.profileFollowId, tx).catch(
      () => undefined,
    );
  }

  return result.removed;
};
