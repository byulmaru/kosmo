import { and, eq, getColumns, inArray, ne, sql } from 'drizzle-orm';
import { db, first, firstOrThrowWith, Instances, ProfileFollows, Profiles } from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { createFollowNotification, deleteNotificationBySource } from './notification';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
type ProfileRow = typeof Profiles.$inferSelect;

type ProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
};

type FollowProfileResult = {
  created: boolean;
  followeeProfile: ProfileRow;
  followerProfile: ProfileRow;
  profileFollow: ProfileFollowRow;
};

type UnfollowProfileResult = {
  followeeProfile: ProfileRow;
  followerProfile: ProfileRow;
  profileFollowId: string | null;
};

type CreateFollowNotification = (sourceId: string) => Promise<void>;
type DeleteFollowNotification = (sourceId: string) => Promise<void>;

export const followProfile = async (
  { followerProfileId, followeeProfileId }: ProfileFollowInput,
  createNotification: CreateFollowNotification = createFollowNotification,
): Promise<FollowProfileResult> => {
  const result = await db.transaction(async (tx) => {
    const target = await tx
      .select({ followPolicy: Profiles.followPolicy, id: Profiles.id })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(Profiles.id, followeeProfileId),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.kind, InstanceKind.LOCAL),
          ne(Instances.state, InstanceState.SUSPENDED),
        ),
      )
      .limit(1)
      .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

    if (followerProfileId === target.id) {
      throw new ConflictError({ message: 'Profile cannot follow itself' });
    }

    const existing = await tx
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, followerProfileId),
          eq(ProfileFollows.followeeProfileId, target.id),
        ),
      )
      .limit(1)
      .then(first);

    let result: { created: boolean; profileFollow: ProfileFollowRow };
    if (existing) {
      result = { created: false, profileFollow: existing };
    } else {
      if (target.followPolicy !== ProfileFollowPolicy.OPEN) {
        throw new ConflictError({ message: 'Profile requires follow request' });
      }

      const inserted = await tx
        .insert(ProfileFollows)
        .values({ followerProfileId, followeeProfileId: target.id })
        .onConflictDoNothing()
        .returning()
        .then(first);

      if (inserted) {
        await tx
          .update(Profiles)
          .set({ followingCount: sql`${Profiles.followingCount} + 1` })
          .where(eq(Profiles.id, followerProfileId));
        await tx
          .update(Profiles)
          .set({ followersCount: sql`${Profiles.followersCount} + 1` })
          .where(eq(Profiles.id, target.id));
        result = { created: true, profileFollow: inserted };
      } else {
        const concurrent = await tx
          .select()
          .from(ProfileFollows)
          .where(
            and(
              eq(ProfileFollows.followerProfileId, followerProfileId),
              eq(ProfileFollows.followeeProfileId, target.id),
            ),
          )
          .limit(1)
          .then(firstOrThrowWith(() => new ConflictError({ message: 'Profile follow failed' })));
        result = { created: false, profileFollow: concurrent };
      }
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

    return { ...result, followeeProfile, followerProfile };
  });

  if (result.created) {
    try {
      await createNotification(result.profileFollow.id);
    } catch {
      // Notification delivery is best-effort and must not change the committed Follow result.
    }
  }

  return result;
};

export const unfollowProfile = async (
  { followerProfileId, followeeProfileId }: ProfileFollowInput,
  deleteNotification: DeleteFollowNotification = (sourceId) =>
    deleteNotificationBySource(NotificationKind.FOLLOW, sourceId),
): Promise<UnfollowProfileResult> => {
  const result = await db.transaction(async (tx) => {
    const target = await tx
      .select(getColumns(Profiles))
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(Profiles.id, followeeProfileId),
          eq(Profiles.state, ProfileState.ACTIVE),
          ne(Instances.state, InstanceState.SUSPENDED),
        ),
      )
      .limit(1)
      .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

    const deleted = await tx
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, followerProfileId),
          eq(ProfileFollows.followeeProfileId, target.id),
        ),
      )
      .returning({ id: ProfileFollows.id })
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

    return { followeeProfile, followerProfile, profileFollowId: deleted?.id ?? null };
  });

  if (result.profileFollowId) {
    try {
      await deleteNotification(result.profileFollowId);
    } catch {
      // Notification cleanup is best-effort and must not change the committed Unfollow result.
    }
  }

  return result;
};
