import { and, eq } from 'drizzle-orm';
import { db, firstOrThrowWith, ProfileFollowRequests } from '../db';
import { NotFoundError } from '../error';
import { executeProfileFollowPairTransition } from '../temporal/follow-command';

export const approveProfileFollowRequest = async ({
  actorProfileId,
  profileFollowRequestId,
}: {
  readonly actorProfileId: string;
  readonly profileFollowRequestId: string;
}) => {
  const request = await db
    .select({
      id: ProfileFollowRequests.id,
      followerProfileId: ProfileFollowRequests.followerProfileId,
      followeeProfileId: ProfileFollowRequests.followeeProfileId,
    })
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, profileFollowRequestId),
        eq(ProfileFollowRequests.followeeProfileId, actorProfileId),
      ),
    )
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
  const result = await executeProfileFollowPairTransition({
    pair: {
      followerProfileId: request.followerProfileId,
      followeeProfileId: request.followeeProfileId,
    },
    command: {
      kind: 'APPROVE',
      actorProfileId,
      expectedRowId: request.id,
      origin: 'LOCAL',
    },
  });

  return {
    followeeProfile: result.followeeProfile,
    followerProfile: result.followerProfile,
    profileFollow: result.profileFollow!,
    profileFollowRequestId: result.result.profileFollowRequestId!,
  };
};

export const rejectProfileFollowRequest = async ({
  actorProfileId,
  profileFollowRequestId,
}: {
  readonly actorProfileId: string;
  readonly profileFollowRequestId: string;
}) => {
  const request = await db
    .select({
      id: ProfileFollowRequests.id,
      followerProfileId: ProfileFollowRequests.followerProfileId,
      followeeProfileId: ProfileFollowRequests.followeeProfileId,
    })
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, profileFollowRequestId),
        eq(ProfileFollowRequests.followeeProfileId, actorProfileId),
      ),
    )
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
  const result = await executeProfileFollowPairTransition({
    pair: {
      followerProfileId: request.followerProfileId,
      followeeProfileId: request.followeeProfileId,
    },
    command: {
      kind: 'REJECT',
      actorProfileId,
      expectedRowId: request.id,
      origin: 'LOCAL',
    },
  });

  return {
    followeeProfile: result.followeeProfile,
    profileFollowRequestId: result.result.profileFollowRequestId!,
  };
};

export const cancelProfileFollowRequest = async ({
  actorProfileId,
  profileFollowRequestId,
}: {
  readonly actorProfileId: string;
  readonly profileFollowRequestId: string;
}) => {
  const request = await db
    .select({
      id: ProfileFollowRequests.id,
      followerProfileId: ProfileFollowRequests.followerProfileId,
      followeeProfileId: ProfileFollowRequests.followeeProfileId,
    })
    .from(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, profileFollowRequestId),
        eq(ProfileFollowRequests.followerProfileId, actorProfileId),
      ),
    )
    .limit(1)
    .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
  const result = await executeProfileFollowPairTransition({
    pair: {
      followerProfileId: request.followerProfileId,
      followeeProfileId: request.followeeProfileId,
    },
    command: {
      kind: 'CANCEL',
      actorProfileId,
      expectedRowId: request.id,
      origin: 'LOCAL',
    },
  });

  return {
    followerProfile: result.followerProfile,
    profileFollowRequestId: result.result.profileFollowRequestId!,
  };
};
