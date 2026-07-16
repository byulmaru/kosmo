import { and, eq, getColumns, inArray, ne, sql } from 'drizzle-orm';
import { db, first, firstOrThrowWith, Instances, ProfileFollows, Profiles } from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';
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

export const followProfile = async ({
  followerProfileId,
  followeeProfileId,
}: ProfileFollowInput): Promise<{
  created: boolean;
  followeeProfile: ProfileRow;
  followerProfile: ProfileRow;
  result: FollowProfileResult;
}> =>
  db.transaction(async (tx) => {
    if (followerProfileId === followeeProfileId) {
      throw new ConflictError({ message: 'Profile cannot follow itself' });
    }

    const participants = await tx
      .select({
        followPolicy: Profiles.followPolicy,
        id: Profiles.id,
        instanceKind: Instances.kind,
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          inArray(Profiles.id, [followerProfileId, followeeProfileId]),
          eq(Profiles.state, ProfileState.ACTIVE),
          ne(Instances.state, InstanceState.SUSPENDED),
        ),
      );
    const follower = participants.find(({ id }) => id === followerProfileId);
    const target = participants.find(({ id }) => id === followeeProfileId);
    if (
      !follower ||
      follower.instanceKind !== InstanceKind.LOCAL ||
      !target ||
      target.instanceKind !== InstanceKind.LOCAL
    ) {
      throw new NotFoundError('Profile not found');
    }

    let created: boolean;
    let result: FollowProfileResult;
    if (target.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED) {
      const ensured = await ensureProfileFollowRequest(
        { followeeProfileId: target.id, followerProfileId },
        tx,
      );
      created = ensured.created;
      result =
        ensured.kind === 'ESTABLISHED'
          ? { kind: 'ESTABLISHED', profileFollow: ensured.profileFollow }
          : { kind: 'PENDING', profileFollowRequest: ensured.profileFollowRequest };
    } else {
      const ensured = await ensureProfileFollow(
        { followeeProfileId: target.id, followerProfileId },
        tx,
      );
      created = ensured.created;
      result = { kind: 'ESTABLISHED', profileFollow: ensured.profileFollow };
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

    return { created, followeeProfile, followerProfile, result };
  });

export const unfollowProfile = async ({
  followerProfileId,
  followeeProfileId,
}: ProfileFollowInput): Promise<{
  followeeProfile: ProfileRow;
  followerProfile: ProfileRow;
  profileFollowId: string | null;
}> =>
  db.transaction(async (tx) => {
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
