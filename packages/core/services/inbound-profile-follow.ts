import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  first,
  getDatabaseConnection,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { NotFoundError } from '../error';
import { ensureProfileFollow, lockProfileFollowPair } from './profile-follow-relation';
import { ensureProfileFollowRequest } from './profile-follow-request';
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

export const recordInboundFollow = async (
  {
    followeeProfileId,
    followerProfileId,
  }: { readonly followeeProfileId: string; readonly followerProfileId: string },
  tx?: Transaction,
): Promise<'ESTABLISHED' | 'PENDING'> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const participants = await tx
      .select({
        followPolicy: Profiles.followPolicy,
        instanceKind: Instances.kind,
        instanceState: Instances.state,
        profileId: Profiles.id,
        profileState: Profiles.state,
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(inArray(Profiles.id, [followerProfileId, followeeProfileId]));
    const follower = participants.find(({ profileId }) => profileId === followerProfileId);
    const followee = participants.find(({ profileId }) => profileId === followeeProfileId);

    if (
      !follower ||
      follower.profileState !== ProfileState.ACTIVE ||
      follower.instanceKind !== InstanceKind.ACTIVITYPUB ||
      follower.instanceState !== InstanceState.ACTIVE ||
      !followee ||
      followee.profileState !== ProfileState.ACTIVE ||
      followee.instanceKind !== InstanceKind.LOCAL ||
      followee.instanceState !== InstanceState.ACTIVE
    ) {
      throw new NotFoundError('Profile not found');
    }

    if (followee.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED) {
      const result = await ensureProfileFollowRequest({ followeeProfileId, followerProfileId }, tx);
      return result.kind;
    }

    await ensureProfileFollow({ followeeProfileId, followerProfileId }, tx);
    return 'ESTABLISHED';
  });

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
    await lockProfileFollowPair({ followeeProfileId, followerProfileId }, tx);

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
