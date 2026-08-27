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
  return {
    ...(await db.transaction((tx) => followProfileInTransaction(input, tx))),
    followeeProfile: await readProfile(input.followeeProfileId),
    followerProfile: await readProfile(input.followerProfileId),
  };
};

export const ensureProfileFollowRequest = async (input: PairInput) =>
  db.transaction((tx) => ensureProfileFollowRequestInTransaction(input, tx));

export const unfollowProfile = async (input: PairInput) =>
  db
    .transaction((tx) =>
      removeProfileFollowProjection(
        { ...input, removePendingRequest: input.origin === 'ACTIVITYPUB' },
        tx,
      ),
    )
    .then(async ({ profileFollow, profileFollowRequest }) => ({
      changed: profileFollow !== undefined || profileFollowRequest !== undefined,
      followeeProfile: await readProfile(input.followeeProfileId),
      followerProfile: await readProfile(input.followerProfileId),
      profileFollowId: profileFollow?.id ?? null,
    }));

export const removeInboundFollow = async (
  input: PairInput & { readonly expectedRowId?: string; readonly transition?: string },
) =>
  db
    .transaction((tx) => removeProfileFollowProjection(input, tx))
    .then(
      ({ profileFollow, profileFollowRequest }) =>
        profileFollow !== undefined || profileFollowRequest !== undefined,
    );

export const acceptProfileFollowRequest = async (
  input: Parameters<typeof acceptProfileFollowRequestInTransaction>[0] & {
    readonly origin?: 'ACTIVITYPUB';
    readonly transition?: string;
  },
) =>
  db
    .transaction((tx) => acceptProfileFollowRequestInTransaction(input, tx))
    .then(({ result }) => result);

export const approveProfileFollowRequest = async (
  input: Parameters<typeof approveProfileFollowRequestInTransaction>[0] & {
    readonly origin?: 'LOCAL' | 'ACTIVITYPUB';
  },
) =>
  db
    .transaction((tx) => approveProfileFollowRequestInTransaction(input, tx))
    .then(async ({ profileFollow, profileFollowRequestId }) => ({
      followeeProfile: await readProfile(profileFollow.followeeProfileId),
      followerProfile: await readProfile(profileFollow.followerProfileId),
      profileFollow,
      profileFollowRequestId,
    }));

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
}) =>
  deleteProfileFollowRequest(input, 'FOLLOWEE').then(async ({ followeeProfileId, id }) => ({
    followeeProfile: await readProfile(followeeProfileId),
    profileFollowRequestId: id,
  }));

export const cancelProfileFollowRequest = async (input: {
  readonly actorProfileId: string;
  readonly profileFollowRequestId: string;
  readonly origin?: 'LOCAL' | 'ACTIVITYPUB';
}) =>
  deleteProfileFollowRequest(input, 'FOLLOWER').then(async ({ followerProfileId, id }) => ({
    followerProfile: await readProfile(followerProfileId),
    profileFollowRequestId: id,
  }));
