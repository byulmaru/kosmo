import { and, eq, inArray, ne } from 'drizzle-orm';
import {
  first,
  firstOrThrow,
  firstOrThrowWith,
  getDatabaseConnection,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceState, ProfileState } from '../enums';
import { NotFoundError, PermissionDeniedError } from '../error';
import { ensureProfileFollow } from './profile-follow-relation';
import type { Transaction } from '../db';

export type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;
export type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

export type ProfileFollowPair = {
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
};

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  { followeeProfileId, followerProfileId }: ProfileFollowPair,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

export const findProfileFollowRequestByPair = (
  pair: ProfileFollowPair,
  tx?: Transaction,
): Promise<ProfileFollowRequestRow | undefined> =>
  getDatabaseConnection(tx)
    .select()
    .from(ProfileFollowRequests)
    .where(pairCondition(ProfileFollowRequests, pair))
    .limit(1)
    .then(first);

export const ensureProfileFollowRequest = async (
  pair: ProfileFollowPair,
  tx?: Transaction,
): Promise<
  | {
      readonly created: false;
      readonly kind: 'ESTABLISHED';
      readonly profileFollow: ProfileFollowRow;
    }
  | {
      readonly created: boolean;
      readonly kind: 'PENDING';
      readonly profileFollowRequest: ProfileFollowRequestRow;
    }
> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const profileFollow = await tx
      .select()
      .from(ProfileFollows)
      .where(pairCondition(ProfileFollows, pair))
      .limit(1)
      .then(first);

    if (profileFollow) {
      await tx.delete(ProfileFollowRequests).where(pairCondition(ProfileFollowRequests, pair));
      return { created: false, kind: 'ESTABLISHED', profileFollow };
    }

    const inserted = await tx
      .insert(ProfileFollowRequests)
      .values(pair)
      .onConflictDoNothing({
        target: [ProfileFollowRequests.followerProfileId, ProfileFollowRequests.followeeProfileId],
      })
      .returning()
      .then(first);
    const profileFollowRequest =
      inserted ??
      (await tx
        .select()
        .from(ProfileFollowRequests)
        .where(pairCondition(ProfileFollowRequests, pair))
        .limit(1)
        .then(firstOrThrow));
    if (!profileFollowRequest) {
      throw new Error('Profile follow request not found after insert conflict');
    }

    return {
      created: inserted !== undefined,
      kind: 'PENDING',
      profileFollowRequest,
    };
  });

export const approveProfileFollowRequest = async (
  {
    actorProfileId,
    profileFollowRequestId,
  }: { readonly actorProfileId: string; readonly profileFollowRequestId: string },
  tx?: Transaction,
): Promise<{
  readonly followeeProfile: typeof Profiles.$inferSelect;
  readonly followerProfile: typeof Profiles.$inferSelect;
  readonly profileFollow: ProfileFollowRow;
  readonly profileFollowRequestId: string;
}> =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const request = await tx
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, profileFollowRequestId))
      .limit(1)
      .for('update', { of: ProfileFollowRequests })
      .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));

    if (request.followeeProfileId !== actorProfileId) {
      throw new PermissionDeniedError();
    }

    const participants = await tx
      .select({
        instanceState: Instances.state,
        profile: Profiles,
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          inArray(Profiles.id, [request.followerProfileId, request.followeeProfileId]),
          eq(Profiles.state, ProfileState.ACTIVE),
          ne(Instances.state, InstanceState.SUSPENDED),
        ),
      )
      .orderBy(Profiles.id);
    const followerProfile = participants.find(
      ({ profile }) => profile.id === request.followerProfileId,
    )?.profile;
    const followeeProfile = participants.find(
      ({ profile }) => profile.id === request.followeeProfileId,
    )?.profile;
    if (!followerProfile || !followeeProfile) {
      throw new NotFoundError('Profile not found');
    }

    const { profileFollow } = await ensureProfileFollow(
      {
        followeeProfileId: request.followeeProfileId,
        followerProfileId: request.followerProfileId,
      },
      tx,
    );

    const updatedProfiles = await tx
      .select()
      .from(Profiles)
      .where(inArray(Profiles.id, [request.followerProfileId, request.followeeProfileId]));

    return {
      followeeProfile: updatedProfiles.find(({ id }) => id === request.followeeProfileId)!,
      followerProfile: updatedProfiles.find(({ id }) => id === request.followerProfileId)!,
      profileFollow,
      profileFollowRequestId: request.id,
    };
  });

const deleteProfileFollowRequestAsActor = async (
  {
    actorProfileId,
    actorRole,
    profileFollowRequestId,
  }: {
    readonly actorProfileId: string;
    readonly actorRole: 'FOLLOWEE' | 'FOLLOWER';
    readonly profileFollowRequestId: string;
  },
  tx?: Transaction,
) =>
  getDatabaseConnection(tx).transaction(async (tx) => {
    const request = await tx
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, profileFollowRequestId))
      .limit(1)
      .for('update', { of: ProfileFollowRequests })
      .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
    const expectedActorProfileId =
      actorRole === 'FOLLOWEE' ? request.followeeProfileId : request.followerProfileId;
    if (expectedActorProfileId !== actorProfileId) {
      throw new PermissionDeniedError();
    }

    const actorProfile = await tx
      .select({ profile: Profiles })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(Profiles.id, actorProfileId),
          eq(Profiles.state, ProfileState.ACTIVE),
          ne(Instances.state, InstanceState.SUSPENDED),
        ),
      )
      .limit(1)
      .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

    const deleted = await tx
      .delete(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, request.id))
      .returning({ id: ProfileFollowRequests.id })
      .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));

    return { actorProfile: actorProfile.profile, profileFollowRequestId: deleted.id };
  });

export const rejectProfileFollowRequest = async (
  input: { readonly actorProfileId: string; readonly profileFollowRequestId: string },
  tx?: Transaction,
): Promise<{
  readonly followeeProfile: typeof Profiles.$inferSelect;
  readonly profileFollowRequestId: string;
}> => {
  const result = await deleteProfileFollowRequestAsActor({ ...input, actorRole: 'FOLLOWEE' }, tx);
  return {
    followeeProfile: result.actorProfile,
    profileFollowRequestId: result.profileFollowRequestId,
  };
};

export const cancelProfileFollowRequest = async (
  input: { readonly actorProfileId: string; readonly profileFollowRequestId: string },
  tx?: Transaction,
): Promise<{
  readonly followerProfile: typeof Profiles.$inferSelect;
  readonly profileFollowRequestId: string;
}> => {
  const result = await deleteProfileFollowRequestAsActor({ ...input, actorRole: 'FOLLOWER' }, tx);
  return {
    followerProfile: result.actorProfile,
    profileFollowRequestId: result.profileFollowRequestId,
  };
};
