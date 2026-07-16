import { and, eq, getColumns, inArray, ne, sql } from 'drizzle-orm';
import {
  ActivityPubActors,
  db,
  first,
  firstOrThrowWith,
  Instances,
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
import { createFollowNotification, deleteNotificationBySource } from './notification';
import { ensureProfileFollow } from './profile-follow-relation';
import { ensureProfileFollowRequest } from './profile-follow-request';
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

export type RemoteProfileFollowActor = Pick<
  typeof ActivityPubActors.$inferSelect,
  'inboxUri' | 'sharedInboxUri' | 'uri'
>;

type ProfileFollowDeliveryOptions = {
  actor: RemoteProfileFollowActor;
  profileFollow: ProfileFollowRow;
  senderProfileId: string;
};

export type ProfileFollowDelivery = {
  sendFollow(options: ProfileFollowDeliveryOptions): Promise<void>;
  sendUndo(options: ProfileFollowDeliveryOptions): Promise<void>;
};

type DeliveryCommand = ProfileFollowDeliveryOptions & {
  kind: 'FOLLOW' | 'UNDO';
};

const deliver = async (
  delivery: ProfileFollowDelivery,
  command: DeliveryCommand | undefined,
): Promise<void> => {
  if (!command) {
    return;
  }

  try {
    if (command.kind === 'FOLLOW') {
      await delivery.sendFollow(command);
    } else {
      await delivery.sendUndo(command);
    }
  } catch (cause) {
    console.error('Failed to deliver ActivityPub profile follow activity', {
      actorUri: command.actor.uri,
      activity: command.kind,
      cause,
      profileFollowId: command.profileFollow.id,
    });
  }
};

const createService = (delivery: ProfileFollowDelivery | undefined) => ({
  followProfile: async ({
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
      if (!follower || follower.instanceKind !== InstanceKind.LOCAL || !target) {
        throw new NotFoundError('Profile not found');
      }

      const isRemote = target.instanceKind === InstanceKind.ACTIVITYPUB;
      if (!isRemote && target.instanceKind !== InstanceKind.LOCAL) {
        throw new NotFoundError('Profile not found');
      }
      if (isRemote && (!delivery || !target.actorUri)) {
        throw new NotFoundError('Profile not found');
      }

      let created: boolean;
      let followResult: FollowProfileResult;
      if (target.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED) {
        if (isRemote) {
          throw new ConflictError({ message: 'Profile requires follow request' });
        }

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
        isRemote &&
        target.instanceState === InstanceState.ACTIVE &&
        target.actorUri &&
        followResult.kind === 'ESTABLISHED'
          ? {
              actor: {
                inboxUri: target.actorInboxUri,
                sharedInboxUri: target.actorSharedInboxUri,
                uri: target.actorUri,
              },
              kind: 'FOLLOW' as const,
              profileFollow: followResult.profileFollow,
              senderProfileId: followerProfileId,
            }
          : undefined;

      return { command, result };
    });

    if (result.created && result.result.kind === 'ESTABLISHED') {
      // Notification delivery is best-effort and must not change the committed Follow result.
      await createFollowNotification(result.result.profileFollow.id).catch(() => undefined);
    }

    if (delivery) {
      await deliver(delivery, command);
    }
    return result;
  },

  unfollowProfile: async ({
    followerProfileId,
    followeeProfileId,
  }: ProfileFollowInput): Promise<{
    followeeProfile: ProfileRow;
    followerProfile: ProfileRow;
    profileFollowId: string | null;
  }> => {
    const { command, result } = await db.transaction(async (tx) => {
      const target = await tx
        .select({
          ...getColumns(Profiles),
          actorInboxUri: ActivityPubActors.inboxUri,
          actorSharedInboxUri: ActivityPubActors.sharedInboxUri,
          actorUri: ActivityPubActors.uri,
          instanceKind: Instances.kind,
          instanceState: Instances.state,
        })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
        .where(
          and(
            eq(Profiles.id, followeeProfileId),
            eq(Profiles.state, ProfileState.ACTIVE),
            ne(Instances.state, InstanceState.SUSPENDED),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      const isRemote = target.instanceKind === InstanceKind.ACTIVITYPUB;
      if (isRemote && (!delivery || !target.actorUri)) {
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
        deleted && isRemote && target.instanceState === InstanceState.ACTIVE && target.actorUri
          ? {
              actor: {
                inboxUri: target.actorInboxUri,
                sharedInboxUri: target.actorSharedInboxUri,
                uri: target.actorUri,
              },
              kind: 'UNDO' as const,
              profileFollow: deleted,
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

    if (delivery) {
      await deliver(delivery, command);
    }
    return result;
  },
});

export const createProfileFollowService = ({ delivery }: { delivery: ProfileFollowDelivery }) =>
  createService(delivery);

export const { followProfile, unfollowProfile } = createService(undefined);
