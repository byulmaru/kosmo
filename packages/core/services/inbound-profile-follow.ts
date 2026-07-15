import { and, asc, eq, inArray, sql } from 'drizzle-orm';
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
import type { Transaction } from '../db';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

export interface RecordInboundFollowInput {
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
}

export type RecordInboundFollowResult =
  | {
      readonly created: boolean;
      readonly kind: 'ESTABLISHED';
      readonly profileFollow: ProfileFollowRow;
    }
  | {
      readonly created: boolean;
      readonly kind: 'PENDING';
      readonly profileFollowRequest: ProfileFollowRequestRow;
    };

export interface RemoveInboundFollowInput {
  readonly expectedRowId?: string;
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
}

export type RemoveInboundFollowResult =
  | { readonly deletedId: string; readonly kind: 'ESTABLISHED' }
  | { readonly deletedId: string; readonly kind: 'PENDING' }
  | null;

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
  { followeeProfileId, followerProfileId }: RecordInboundFollowInput,
  tx?: Transaction,
): Promise<RecordInboundFollowResult> =>
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
      .where(inArray(Profiles.id, [followerProfileId, followeeProfileId]))
      .orderBy(asc(Profiles.id))
      .for('update', { of: Profiles });
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

    const existingFollow = await tx
      .select()
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
      .limit(1)
      .for('update', { of: ProfileFollows })
      .then(first);

    if (existingFollow) {
      await tx
        .delete(ProfileFollowRequests)
        .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId));
      return { created: false, kind: 'ESTABLISHED', profileFollow: existingFollow };
    }

    if (followee.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED) {
      const existingRequest = await tx
        .select()
        .from(ProfileFollowRequests)
        .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId))
        .limit(1)
        .for('update', { of: ProfileFollowRequests })
        .then(first);

      if (existingRequest) {
        return {
          created: false,
          kind: 'PENDING',
          profileFollowRequest: existingRequest,
        };
      }

      const profileFollowRequest = await tx
        .insert(ProfileFollowRequests)
        .values({
          followeeProfileId,
          followerProfileId,
        })
        .returning()
        .then(first);

      return { created: true, kind: 'PENDING', profileFollowRequest: profileFollowRequest! };
    }

    await tx
      .delete(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId));
    const profileFollow = await tx
      .insert(ProfileFollows)
      .values({
        followeeProfileId,
        followerProfileId,
      })
      .returning()
      .then(first);

    await tx
      .update(Profiles)
      .set({ followingCount: sql`${Profiles.followingCount} + 1` })
      .where(eq(Profiles.id, followerProfileId));
    await tx
      .update(Profiles)
      .set({ followersCount: sql`${Profiles.followersCount} + 1` })
      .where(eq(Profiles.id, followeeProfileId));

    return { created: true, kind: 'ESTABLISHED', profileFollow: profileFollow! };
  });

export const removeInboundFollow = async (
  { expectedRowId, followeeProfileId, followerProfileId }: RemoveInboundFollowInput,
  tx?: Transaction,
): Promise<RemoveInboundFollowResult> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const profileFollow = await tx
      .select({ id: ProfileFollows.id })
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
      .limit(1)
      .then(first);

    if (profileFollow) {
      if (expectedRowId !== undefined && profileFollow.id !== expectedRowId) {
        return null;
      }

      const deleted = await tx
        .delete(ProfileFollows)
        .where(eq(ProfileFollows.id, profileFollow.id))
        .returning({ id: ProfileFollows.id })
        .then(first);

      if (!deleted) {
        return null;
      }

      await tx
        .update(Profiles)
        .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
        .where(eq(Profiles.id, followerProfileId));
      await tx
        .update(Profiles)
        .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
        .where(eq(Profiles.id, followeeProfileId));

      return { deletedId: deleted.id, kind: 'ESTABLISHED' };
    }

    const profileFollowRequest = await tx
      .select({ id: ProfileFollowRequests.id })
      .from(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId))
      .limit(1)
      .then(first);

    if (!profileFollowRequest) {
      return null;
    }

    if (expectedRowId !== undefined && profileFollowRequest.id !== expectedRowId) {
      return null;
    }

    const deleted = await tx
      .delete(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, profileFollowRequest.id))
      .returning({ id: ProfileFollowRequests.id })
      .then(first);

    return deleted ? { deletedId: deleted.id, kind: 'PENDING' } : null;
  });
