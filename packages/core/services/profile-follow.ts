import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { ActivityPubActors, db, first, Instances, ProfileFollows, Profiles } from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { createFollowNotification, deleteNotificationBySource } from './notification';
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
};

type ProfileFollowDirection = 'ACTIVITYPUB_INBOUND' | 'ACTIVITYPUB_OUTBOUND' | 'LOCAL';

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

  let direction: ProfileFollowDirection;
  if (follower.instanceKind === InstanceKind.LOCAL && target.instanceKind === InstanceKind.LOCAL) {
    direction = 'LOCAL';
  } else if (
    follower.instanceKind === InstanceKind.LOCAL &&
    target.instanceKind === InstanceKind.ACTIVITYPUB &&
    target.actorUri
  ) {
    direction = 'ACTIVITYPUB_OUTBOUND';
  } else if (
    follower.instanceKind === InstanceKind.ACTIVITYPUB &&
    follower.instanceState === InstanceState.ACTIVE &&
    follower.actorUri &&
    target.instanceKind === InstanceKind.LOCAL &&
    target.instanceState === InstanceState.ACTIVE
  ) {
    direction = 'ACTIVITYPUB_INBOUND';
  } else {
    throw new NotFoundError('Profile not found');
  }

  return { direction, target };
};

export const followProfile = async ({
  followerProfileId,
  followeeProfileId,
}: ProfileFollowInput): Promise<{
  created: boolean;
  followeeProfile: ProfileRow;
  followerProfile: ProfileRow;
  result: FollowProfileResult;
}> => {
  const { command, result } = await db.transaction(async (tx) => {
    if (followerProfileId === followeeProfileId) {
      throw new ConflictError({ message: 'Profile cannot follow itself' });
    }

    const { direction, target } = await loadProfileFollowParticipants(tx, {
      followerProfileId,
      followeeProfileId,
    });

    let created: boolean;
    let followResult: FollowProfileResult;
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
    } else {
      const ensured = await ensureProfileFollow(
        { followeeProfileId: target.id, followerProfileId },
        tx,
      );
      created = ensured.created;
      followResult = { kind: 'ESTABLISHED', profileFollow: ensured.profileFollow };
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
      direction === 'ACTIVITYPUB_OUTBOUND' &&
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

    return { command, result };
  });

  if (result.created && result.result.kind === 'ESTABLISHED') {
    // Notification delivery is best-effort and must not change the committed Follow result.
    await createFollowNotification(result.result.profileFollow.id).catch(() => undefined);
  }

  if (command) {
    const { sendProfileFollow } = await import('@kosmo/fedify');
    await sendProfileFollow(command);
  }
  return result;
};

export const unfollowProfile = async ({
  followerProfileId,
  followeeProfileId,
}: ProfileFollowInput): Promise<{
  followeeProfile: ProfileRow;
  followerProfile: ProfileRow;
  profileFollowId: string | null;
}> => {
  const { command, result } = await db.transaction(async (tx) => {
    const { direction, target } = await loadProfileFollowParticipants(tx, {
      followerProfileId,
      followeeProfileId,
    });
    if (direction === 'ACTIVITYPUB_INBOUND') {
      throw new NotFoundError('Profile not found');
    }

    const deleted = await tx
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, followerProfileId),
          eq(ProfileFollows.followeeProfileId, target.id),
        ),
      )
      .returning()
      .then(first);

    if (deleted) {
      await tx
        .update(Profiles)
        .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
        .where(eq(Profiles.id, followerProfileId));
      await tx
        .update(Profiles)
        .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
        .where(eq(Profiles.id, target.id));
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

    const result = {
      followeeProfile,
      followerProfile,
      profileFollowId: deleted?.id ?? null,
    };
    const command =
      deleted &&
      direction === 'ACTIVITYPUB_OUTBOUND' &&
      target.instanceState === InstanceState.ACTIVE &&
      target.actorUri
        ? {
            actor: {
              inboxUri: target.actorInboxUri,
              sharedInboxUri: target.actorSharedInboxUri,
              uri: target.actorUri,
            },
            outboundFollow: deleted,
            senderProfileId: followerProfileId,
          }
        : undefined;

    return { command, result };
  });

  if (result.profileFollowId) {
    // Notification cleanup is best-effort and must not change the committed Unfollow result.
    await deleteNotificationBySource(NotificationKind.FOLLOW, result.profileFollowId).catch(
      () => undefined,
    );
  }

  if (command) {
    const { sendProfileUnfollow } = await import('@kosmo/fedify');
    await sendProfileUnfollow(command);
  }
  return result;
};
