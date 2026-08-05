import { and, eq, inArray, ne, notExists, or, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { ConflictError, NotFoundError } from '../error';
import {
  createFollowNotification,
  createFollowRequestNotificationPostCommit,
  deleteFollowRequestNotificationPostCommit,
  deleteNotificationBySource,
} from './notification';
import { ensureProfileFollow } from './profile-follow-relation';
import { ensureProfileFollowRequest } from './profile-follow-request';
import type { Transaction } from '../db';
import type { ProfileFollowRequestRow } from './profile-follow-request';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
type ProfileRow = typeof Profiles.$inferSelect;

export type FollowProfileResult =
  | { readonly kind: 'ESTABLISHED'; readonly profileFollow: ProfileFollowRow }
  | { readonly kind: 'PENDING'; readonly profileFollowRequest: ProfileFollowRequestRow };

type ProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
  onPostCommitError?: (error: unknown) => void | Promise<void>;
};

const loadProfileFollowParticipants = async (
  tx: Transaction,
  { followerProfileId, followeeProfileId }: ProfileFollowInput,
) => {
  const participants = await tx
    .select({
      actorInboxUri: ActivityPubActors.inboxUri,
      actorSharedInboxUri: ActivityPubActors.sharedInboxUri,
      actorUri: ActivityPubActors.uri,
      followPolicy: Profiles.followPolicy,
      id: Profiles.id,
      instanceKind: Instances.kind,
      instanceState: Instances.state,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        inArray(Profiles.id, [followerProfileId, followeeProfileId]),
        eq(Profiles.state, ProfileState.ACTIVE),
        ne(Instances.state, InstanceState.SUSPENDED),
      ),
    );

  const follower = participants.find(({ id }) => id === followerProfileId);
  const target = participants.find(({ id }) => id === followeeProfileId);
  if (!follower || !target) {
    throw new NotFoundError('Profile not found');
  }

  const isRemoteTarget = target.instanceKind === InstanceKind.ACTIVITYPUB;
  const isActivityPubInbound =
    follower.instanceKind === InstanceKind.ACTIVITYPUB &&
    target.instanceKind === InstanceKind.LOCAL;
  const validOriginPair = isActivityPubInbound
    ? follower.instanceState === InstanceState.ACTIVE &&
      target.instanceState === InstanceState.ACTIVE
    : follower.instanceKind === InstanceKind.LOCAL &&
      (target.instanceKind === InstanceKind.LOCAL || (isRemoteTarget && target.actorUri));
  if (!validOriginPair) {
    throw new NotFoundError('Profile not found');
  }

  return { isActivityPubInbound, isRemoteTarget, target };
};

export const followProfile = async ({
  followerProfileId,
  followeeProfileId,
  onPostCommitError,
}: ProfileFollowInput): Promise<{
  created: boolean;
  followeeProfile: ProfileRow;
  followerProfile: ProfileRow;
  result: FollowProfileResult;
}> => {
  const { command, pendingNotificationSourceId, result } = await db.transaction(async (tx) => {
    if (followerProfileId === followeeProfileId) {
      throw new ConflictError({ message: 'Profile cannot follow itself' });
    }

    const { isActivityPubInbound, isRemoteTarget, target } = await loadProfileFollowParticipants(
      tx,
      {
        followerProfileId,
        followeeProfileId,
      },
    );

    const pendingRequest = await tx
      .select({ id: ProfileFollowRequests.id })
      .from(ProfileFollowRequests)
      .where(pairCondition(ProfileFollowRequests, followerProfileId, target.id))
      .limit(1)
      .then(first);

    let created: boolean;
    let followResult: FollowProfileResult;
    let pendingNotificationSourceId: string | undefined;
    if (target.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED) {
      const ensured = await ensureProfileFollowRequest(
        { followeeProfileId: target.id, followerProfileId },
        tx,
      );
      created = ensured.created;
      followResult =
        ensured.kind === 'ESTABLISHED'
          ? { kind: 'ESTABLISHED', profileFollow: ensured.profileFollow }
          : { kind: 'PENDING', profileFollowRequest: ensured.profileFollowRequest };
      if (ensured.kind === 'ESTABLISHED') {
        pendingNotificationSourceId = pendingRequest?.id;
      }
    } else {
      const ensured = await ensureProfileFollow(
        { followeeProfileId: target.id, followerProfileId },
        tx,
      );
      created = ensured.created;
      followResult = { kind: 'ESTABLISHED', profileFollow: ensured.profileFollow };
      pendingNotificationSourceId = pendingRequest?.id;
    }

    const profiles = await tx
      .select()
      .from(Profiles)
      .where(inArray(Profiles.id, [followerProfileId, target.id]));
    const followerProfile = profiles.find(({ id }) => id === followerProfileId);
    const followeeProfile = profiles.find(({ id }) => id === target.id);
    if (!followerProfile || !followeeProfile) {
      throw new NotFoundError('Profile not found');
    }

    const result = { created, followeeProfile, followerProfile, result: followResult };
    const command =
      created &&
      !isActivityPubInbound &&
      isRemoteTarget &&
      target.instanceState === InstanceState.ACTIVE &&
      target.actorUri
        ? {
            actor: {
              inboxUri: target.actorInboxUri,
              sharedInboxUri: target.actorSharedInboxUri,
              uri: target.actorUri,
            },
            outboundFollow:
              followResult.kind === 'ESTABLISHED'
                ? followResult.profileFollow
                : followResult.profileFollowRequest,
            senderProfileId: followerProfileId,
          }
        : undefined;

    return { command, pendingNotificationSourceId, result };
  });

  if (result.created && result.result.kind === 'ESTABLISHED') {
    // Notification delivery is best-effort and must not change the committed Follow result.
    await createFollowNotification(result.result.profileFollow.id).catch(async (error) => {
      if (!onPostCommitError) {
        return;
      }

      try {
        await onPostCommitError(error);
      } catch (observerError) {
        console.error('Follow notification creation observation failed', {
          error,
          observerError,
          followeeProfileId,
          followerProfileId,
        });
      }
    });
  }

  if (result.created && result.result.kind === 'PENDING') {
    await createFollowRequestNotificationPostCommit(
      result.result.profileFollowRequest.id,
      onPostCommitError,
    );
  }

  if (pendingNotificationSourceId) {
    await deleteFollowRequestNotificationPostCommit(pendingNotificationSourceId);
  }

  if (command) {
    try {
      const { sendProfileFollow } = await import('@kosmo/fedify');
      await sendProfileFollow(command);
    } catch (error) {
      console.error('Post-commit ActivityPub Follow delivery failed', {
        error,
        followeeProfileId,
        followerProfileId,
      });
    }
  }
  return result;
};

export const unfollowProfile = async ({
  followerProfileId,
  followeeProfileId,
  onPostCommitError,
}: ProfileFollowInput): Promise<{
  changed: boolean;
  followeeProfile: ProfileRow;
  followerProfile: ProfileRow;
  profileFollowId: string | null;
}> => {
  const { command, result } = await db.transaction(async (tx) => {
    const { isActivityPubInbound, isRemoteTarget, target } = await loadProfileFollowParticipants(
      tx,
      {
        followerProfileId,
        followeeProfileId,
      },
    );

    const deleted = await removeProfileFollowProjection(
      {
        followeeProfileId: target.id,
        followerProfileId,
        removePendingRequest: isActivityPubInbound,
      },
      tx,
    );

    const profiles = await tx
      .select()
      .from(Profiles)
      .where(inArray(Profiles.id, [followerProfileId, target.id]));
    const followerProfile = profiles.find(({ id }) => id === followerProfileId);
    const followeeProfile = profiles.find(({ id }) => id === target.id);
    if (!followerProfile || !followeeProfile) {
      throw new NotFoundError('Profile not found');
    }

    const result = {
      changed: deleted.profileFollow !== undefined || deleted.profileFollowRequest !== undefined,
      followeeProfile,
      followerProfile,
      profileFollowId: deleted.profileFollow?.id ?? null,
      profileFollowRequestId: deleted.profileFollowRequest?.id ?? null,
    };
    const command =
      deleted.profileFollow &&
      !isActivityPubInbound &&
      isRemoteTarget &&
      target.instanceState === InstanceState.ACTIVE &&
      target.actorUri
        ? {
            actor: {
              inboxUri: target.actorInboxUri,
              sharedInboxUri: target.actorSharedInboxUri,
              uri: target.actorUri,
            },
            outboundFollow: deleted.profileFollow,
            senderProfileId: followerProfileId,
          }
        : undefined;

    return { command, result };
  });

  if (result.profileFollowId) {
    // Notification cleanup is best-effort and must not change the committed Unfollow result.
    await deleteNotificationBySource(NotificationKind.FOLLOW, result.profileFollowId).catch(
      async (error) => {
        if (!onPostCommitError) {
          return;
        }

        try {
          await onPostCommitError(error);
        } catch (observerError) {
          console.error('Follow notification cleanup observation failed', {
            error,
            observerError,
            followeeProfileId,
            followerProfileId,
          });
        }
      },
    );
  }

  if (result.profileFollowRequestId) {
    await deleteFollowRequestNotificationPostCommit(result.profileFollowRequestId);
  }

  if (command) {
    try {
      const { sendProfileUnfollow } = await import('@kosmo/fedify');
      await sendProfileUnfollow(command);
    } catch (error) {
      console.error('Post-commit ActivityPub Undo delivery failed', {
        error,
        followeeProfileId,
        followerProfileId,
      });
    }
  }
  return result;
};

const pairCondition = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  followerProfileId: string,
  followeeProfileId: string,
) =>
  and(
    eq(table.followerProfileId, followerProfileId),
    eq(table.followeeProfileId, followeeProfileId),
  );

const removeProfileFollowProjection = async (
  {
    expectedRowId,
    followeeProfileId,
    followerProfileId,
    removePendingRequest = true,
  }: {
    readonly expectedRowId?: string;
    readonly followeeProfileId: string;
    readonly followerProfileId: string;
    readonly removePendingRequest?: boolean;
  },
  tx: Transaction,
): Promise<{
  readonly profileFollow: ProfileFollowRow | undefined;
  readonly profileFollowRequest: ProfileFollowRequestRow | undefined;
}> => {
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
    .select()
    .from(ProfileFollows)
    .where(pairCondition(ProfileFollows, followerProfileId, followeeProfileId))
    .limit(1)
    .then(first);

  if (profileFollow) {
    if (expectedRowId !== undefined && profileFollow.id !== expectedRowId) {
      return { profileFollow: undefined, profileFollowRequest: undefined };
    }

    const deleted = await tx
      .delete(ProfileFollows)
      .where(and(eq(ProfileFollows.id, profileFollow.id), notExists(unavailableParticipants)))
      .returning()
      .then(first);
    if (!deleted) {
      return { profileFollow: undefined, profileFollowRequest: undefined };
    }

    await tx
      .update(Profiles)
      .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
      .where(eq(Profiles.id, followerProfileId));
    await tx
      .update(Profiles)
      .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
      .where(eq(Profiles.id, followeeProfileId));

    return { profileFollow: deleted, profileFollowRequest: undefined };
  }

  if (!removePendingRequest) {
    return { profileFollow: undefined, profileFollowRequest: undefined };
  }

  const profileFollowRequest = await tx
    .select()
    .from(ProfileFollowRequests)
    .where(pairCondition(ProfileFollowRequests, followerProfileId, followeeProfileId))
    .limit(1)
    .then(first);
  if (
    !profileFollowRequest ||
    (expectedRowId !== undefined && profileFollowRequest.id !== expectedRowId)
  ) {
    return { profileFollow: undefined, profileFollowRequest: undefined };
  }

  const deleted = await tx
    .delete(ProfileFollowRequests)
    .where(
      and(
        eq(ProfileFollowRequests.id, profileFollowRequest.id),
        notExists(unavailableParticipants),
      ),
    )
    .returning()
    .then(first);

  return { profileFollow: undefined, profileFollowRequest: deleted };
};

export const removeInboundFollow = async (input: {
  readonly expectedRowId?: string;
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
  readonly onPostCommitError?: (error: unknown) => void | Promise<void>;
}): Promise<boolean> => {
  const deleted = await db.transaction((tx) => removeProfileFollowProjection(input, tx));

  if (deleted.profileFollow) {
    await deleteNotificationBySource(NotificationKind.FOLLOW, deleted.profileFollow.id).catch(
      async (error) => {
        if (!input.onPostCommitError) {
          return;
        }

        try {
          await input.onPostCommitError(error);
        } catch (observerError) {
          console.error('Follow notification cleanup observation failed', {
            error,
            observerError,
            followeeProfileId: input.followeeProfileId,
            followerProfileId: input.followerProfileId,
          });
        }
      },
    );
  }
  if (deleted.profileFollowRequest) {
    await deleteFollowRequestNotificationPostCommit(deleted.profileFollowRequest.id);
  }

  return deleted.profileFollow !== undefined || deleted.profileFollowRequest !== undefined;
};
