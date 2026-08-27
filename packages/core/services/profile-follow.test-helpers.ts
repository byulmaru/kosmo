import { eq } from 'drizzle-orm';
import { db, firstOrThrow, Profiles } from '../db';
import {
  acceptProfileFollowRequestInTransaction,
  approveProfileFollowRequestInTransaction,
  deleteProfileFollowRequestAsActorInTransaction,
  ensureProfileFollowRequest as ensureProfileFollowRequestInTransaction,
  followProfileInTransaction,
  removeProfileFollowProjection,
} from './profile-follow-transaction';

type PairInput = {
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
  readonly origin?: 'LOCAL' | 'ACTIVITYPUB';
};

const readProfile = (id: string) =>
  db.select().from(Profiles).where(eq(Profiles.id, id)).then(firstOrThrow);

export const followProfile = async (input: PairInput) => {
  const followed = await db.transaction((tx) => followProfileInTransaction(input, tx));
  return {
    ...followed,
    followeeProfile: await readProfile(input.followeeProfileId),
    followerProfile: await readProfile(input.followerProfileId),
  };
};

export const ensureProfileFollowRequest = async (input: PairInput) =>
  db.transaction((tx) => ensureProfileFollowRequestInTransaction(input, tx));

export const unfollowProfile = async (input: PairInput) => {
  const deleted = await db.transaction((tx) =>
    removeProfileFollowProjection(
      { ...input, removePendingRequest: input.origin === 'ACTIVITYPUB' },
      tx,
    ),
  );
  return {
    changed: deleted.profileFollow !== undefined || deleted.profileFollowRequest !== undefined,
    followeeProfile: await readProfile(input.followeeProfileId),
    followerProfile: await readProfile(input.followerProfileId),
    profileFollowId: deleted.profileFollow?.id ?? null,
  };
};

export const removeInboundFollow = async (
  input: PairInput & { readonly expectedRowId?: string; readonly transition?: string },
) =>
  db.transaction(async (tx) => {
    const deleted = await removeProfileFollowProjection(input, tx);
    return deleted.profileFollow !== undefined || deleted.profileFollowRequest !== undefined;
  });

export const acceptProfileFollowRequest = async (
  input: Parameters<typeof acceptProfileFollowRequestInTransaction>[0] & {
    readonly origin?: 'ACTIVITYPUB';
    readonly transition?: string;
  },
) =>
  db.transaction(async (tx) => (await acceptProfileFollowRequestInTransaction(input, tx)).result);

export const approveProfileFollowRequest = async (
  input: Parameters<typeof approveProfileFollowRequestInTransaction>[0] & {
    readonly origin?: 'LOCAL' | 'ACTIVITYPUB';
  },
) => {
  const approved = await db.transaction((tx) =>
    approveProfileFollowRequestInTransaction(input, tx),
  );
  return {
    followeeProfile: await readProfile(approved.profileFollow.followeeProfileId),
    followerProfile: await readProfile(approved.profileFollow.followerProfileId),
    profileFollow: approved.profileFollow,
    profileFollowRequestId: approved.profileFollowRequestId,
  };
};

const deleteProfileFollowRequest = async (
  input: {
    readonly actorProfileId: string;
    readonly profileFollowRequestId: string;
  },
  actorRole: 'FOLLOWEE' | 'FOLLOWER',
) =>
  db.transaction((tx) =>
    deleteProfileFollowRequestAsActorInTransaction({ ...input, actorRole }, tx),
  );

export const rejectProfileFollowRequest = async (input: {
  readonly actorProfileId: string;
  readonly profileFollowRequestId: string;
  readonly origin?: 'LOCAL' | 'ACTIVITYPUB';
}) => {
  const request = await deleteProfileFollowRequest(input, 'FOLLOWEE');
  return {
    followeeProfile: await readProfile(request.followeeProfileId),
    profileFollowRequestId: request.id,
  };
};

export const cancelProfileFollowRequest = async (input: {
  readonly actorProfileId: string;
  readonly profileFollowRequestId: string;
  readonly origin?: 'LOCAL' | 'ACTIVITYPUB';
}) => {
  const request = await deleteProfileFollowRequest(input, 'FOLLOWER');
  return {
    followerProfile: await readProfile(request.followerProfileId),
    profileFollowRequestId: request.id,
  };
};
