import { db } from '../db';
import {
  acceptProfileFollowRequestInTransaction,
  approveProfileFollowRequestInTransaction,
  cancelProfileFollowRequestInTransaction,
  followProfileInTransaction,
  rejectProfileFollowRequestInTransaction,
  removeInboundFollowInTransaction,
  unfollowProfileInTransaction,
} from './profile-follow-transaction';

export const followProfile = async (input: Parameters<typeof followProfileInTransaction>[0]) =>
  db.transaction(async (tx) => (await followProfileInTransaction(input, tx)).result);

export const unfollowProfile = async (input: Parameters<typeof unfollowProfileInTransaction>[0]) =>
  db.transaction(async (tx) => (await unfollowProfileInTransaction(input, tx)).result);

export const removeInboundFollow = async (
  input: Parameters<typeof removeInboundFollowInTransaction>[0],
) =>
  db.transaction(async (tx) => {
    const deleted = await removeInboundFollowInTransaction(input, tx);
    return deleted.profileFollow !== undefined || deleted.profileFollowRequest !== undefined;
  });

export const acceptProfileFollowRequest = async (
  input: Parameters<typeof acceptProfileFollowRequestInTransaction>[0],
) =>
  db.transaction(async (tx) => (await acceptProfileFollowRequestInTransaction(input, tx)).result);

export const approveProfileFollowRequest = async (
  input: Parameters<typeof approveProfileFollowRequestInTransaction>[0],
) => {
  const approved = await db.transaction((tx) =>
    approveProfileFollowRequestInTransaction(input, tx),
  );
  return {
    followeeProfile: approved.followeeProfile,
    followerProfile: approved.followerProfile,
    profileFollow: approved.profileFollow,
    profileFollowRequestId: approved.profileFollowRequestId,
  };
};

export const rejectProfileFollowRequest = async (
  input: Parameters<typeof rejectProfileFollowRequestInTransaction>[0],
) => {
  const deleted = await db.transaction((tx) => rejectProfileFollowRequestInTransaction(input, tx));
  return {
    followeeProfile: deleted.actorProfile,
    profileFollowRequestId: deleted.request.id,
  };
};

export const cancelProfileFollowRequest = async (
  input: Parameters<typeof cancelProfileFollowRequestInTransaction>[0],
) => {
  const deleted = await db.transaction((tx) => cancelProfileFollowRequestInTransaction(input, tx));
  return {
    followerProfile: deleted.actorProfile,
    profileFollowRequestId: deleted.request.id,
  };
};
