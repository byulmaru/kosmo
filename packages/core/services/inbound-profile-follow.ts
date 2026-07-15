import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  createId,
  first,
  getDatabaseConnection,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
  TableDiscriminator,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { NotFoundError } from '../error';
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
      const existingFollow = await tx
        .select({ id: ProfileFollows.id })
        .from(ProfileFollows)
        .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
        .limit(1)
        .then(first);

      if (existingFollow) {
        await tx
          .delete(ProfileFollowRequests)
          .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId));
        return 'ESTABLISHED';
      }

      await tx
        .insert(ProfileFollowRequests)
        .values({
          followeeProfileId,
          followerProfileId,
        })
        .onConflictDoUpdate({
          target: [
            ProfileFollowRequests.followerProfileId,
            ProfileFollowRequests.followeeProfileId,
          ],
          set: { id: sql`${ProfileFollowRequests.id}` },
        });

      return 'PENDING';
    }

    const followId = createId(TableDiscriminator.ProfileFollows);
    const profileFollow = await tx
      .insert(ProfileFollows)
      .values({
        followeeProfileId,
        followerProfileId,
        id: followId,
      })
      .onConflictDoUpdate({
        target: [ProfileFollows.followerProfileId, ProfileFollows.followeeProfileId],
        set: { id: sql`${ProfileFollows.id}` },
      })
      .returning({ id: ProfileFollows.id })
      .then(first);

    await tx
      .delete(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId));

    if (profileFollow!.id !== followId) {
      return 'ESTABLISHED';
    }

    await tx
      .update(Profiles)
      .set({ followingCount: sql`${Profiles.followingCount} + 1` })
      .where(eq(Profiles.id, followerProfileId));
    await tx
      .update(Profiles)
      .set({ followersCount: sql`${Profiles.followersCount} + 1` })
      .where(eq(Profiles.id, followeeProfileId));

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
