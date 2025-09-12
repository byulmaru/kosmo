import {
  firstOrThrow,
  getDatabaseConnection,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/db';
import { and, eq, sql } from 'drizzle-orm';
import type { Transaction } from '@kosmo/db';
import type { ProfileFollowAcceptMode, ProfileProtocol } from '@kosmo/enum';

type CreateProfileParams = {
  data: {
    instanceId: string;
    handle: string;
    uri?: string;
    inboxUrl?: string;
    sharedinboxUrl?: string;
    url?: string;
    protocol?: ProfileProtocol;
    displayName?: string;
    description?: string;
    followAcceptMode?: ProfileFollowAcceptMode;
  };
  tx?: Transaction;
};

export const create = async ({ data, tx }: CreateProfileParams) => {
  const db = getDatabaseConnection(tx);
  return db
    .insert(Profiles)
    .values({
      ...data,
      normalizedHandle: data.handle.toLowerCase(),
    })
    .returning({ id: Profiles.id })
    .onConflictDoUpdate({
      target: [Profiles.uri],
      set: {
        ...data,
        normalizedHandle: data.handle.toLowerCase(),
      },
    })
    .then(firstOrThrow);
};

export const getUri = (profileId: string, webDomain: string) => {
  return new URL(`/profile/${profileId}`, webDomain);
};

export const getUrl = (handle: string, webDomain: string) => {
  return new URL(`/@${handle}`, webDomain);
};

export const getInboxUrl = (profileId: string, webDomain: string) => {
  return new URL(`/profile/${profileId}/inbox`, webDomain);
};

export const getSharedInboxUrl = (webDomain: string) => {
  return new URL(`/inbox`, webDomain);
};

export const getFollowersUri = (profileId: string, webDomain: string) => {
  return new URL(`/profile/${profileId}/followers`, webDomain);
};

export const getFollowingUri = (profileId: string, webDomain: string) => {
  return new URL(`/profile/${profileId}/following`, webDomain);
};

type CreateFollowParams = {
  tx: Transaction;
  actorProfileId: string;
  targetProfileId: string;
};

export const createFollow = async ({ tx, actorProfileId, targetProfileId }: CreateFollowParams) => {
  const result = await tx
    .insert(ProfileFollows)
    .values({
      profileId: actorProfileId,
      targetProfileId,
    })
    .onConflictDoNothing()
    .returning({ id: ProfileFollows.id });

  if (result.length > 0) {
    await Promise.all([
      tx
        .update(Profiles)
        .set({
          followerCount: sql`${Profiles.followerCount} + 1`,
        })
        .where(eq(Profiles.id, targetProfileId)),
      tx
        .update(Profiles)
        .set({
          followingCount: sql`${Profiles.followingCount} + 1`,
        })
        .where(eq(Profiles.id, actorProfileId)),
    ]);

    return true;
  } else {
    return false;
  }
};

type DeleteFollowParams = {
  tx: Transaction;
  actorProfileId: string;
  targetProfileId: string;
};

export const deleteFollow = async ({ tx, actorProfileId, targetProfileId }: DeleteFollowParams) => {
  const result = await tx
    .delete(ProfileFollows)
    .where(
      and(
        eq(ProfileFollows.profileId, actorProfileId),
        eq(ProfileFollows.targetProfileId, targetProfileId),
      ),
    )
    .returning({ id: ProfileFollows.id });

  if (result.length > 0) {
    await Promise.all([
      tx
        .update(Profiles)
        .set({ followerCount: sql`${Profiles.followerCount} - 1` })
        .where(eq(Profiles.id, targetProfileId)),
      tx
        .update(Profiles)
        .set({ followingCount: sql`${Profiles.followingCount} - 1` })
        .where(eq(Profiles.id, actorProfileId)),
    ]);

    return true;
  } else {
    return false;
  }
};

type CreateFollowRequestParams = {
  tx: Transaction;
  actorProfileId: string;
  targetProfileId: string;
};

export const createFollowRequest = async ({
  tx,
  actorProfileId,
  targetProfileId,
}: CreateFollowRequestParams) => {
  const result = await tx
    .insert(ProfileFollowRequests)
    .values({
      profileId: actorProfileId,
      targetProfileId,
    })
    .onConflictDoNothing()
    .returning({ id: ProfileFollowRequests.id });

  return result.length > 0;
};

type DeleteFollowRequestParams = {
  tx: Transaction;
} & (
  | {
      actorProfileId: string;
      targetProfileId: string;
    }
  | { id: string }
);

export const deleteFollowRequest = async ({ tx, ...params }: DeleteFollowRequestParams) => {
  const result = await tx
    .delete(ProfileFollowRequests)
    .where(
      'id' in params
        ? eq(ProfileFollowRequests.id, params.id)
        : and(
            eq(ProfileFollowRequests.profileId, params.actorProfileId),
            eq(ProfileFollowRequests.targetProfileId, params.targetProfileId),
          ),
    )
    .returning({ id: ProfileFollowRequests.id });

  return result.length > 0;
};
