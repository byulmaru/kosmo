import { and, eq, sql } from 'drizzle-orm';
import { db, first, firstOrThrow, ProfileFollowRequests, ProfileFollows, Profiles } from './db';

export type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

export type ProfileFollowActivityPubMetadata = Partial<
  Pick<
    ProfileFollowRow,
    | 'activityPubFollowActorUri'
    | 'activityPubFollowGenerationAt'
    | 'activityPubFollowObjectUri'
    | 'activityPubFollowOrderingKey'
    | 'activityPubFollowUri'
  >
>;

type CreateProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
  deletePendingRequest?: boolean;
  activityPubMetadata?:
    | ProfileFollowActivityPubMetadata
    | ((profileFollow: ProfileFollowRow) => ProfileFollowActivityPubMetadata);
};

export type CreateProfileFollowResult = {
  created: boolean;
  profileFollow: ProfileFollowRow;
};

type ProfileFollowCountExecutor = Pick<typeof db, 'execute' | 'update'>;

export const lockProfileFollowCountUpdates = async (executor: ProfileFollowCountExecutor) => {
  // ponytail: global count lock; switch to per-profile locks if follow throughput needs it.
  await executor.execute(sql`select pg_advisory_xact_lock(hashtext('profile_follow_counts'))`);
};

export const setRemoteProfileFollowCountBaseline = async ({
  executor,
  followersCount,
  followingCount,
  profileId,
}: {
  executor: ProfileFollowCountExecutor;
  followersCount?: number;
  followingCount?: number;
  profileId: string;
}) => {
  if (followersCount === undefined && followingCount === undefined) {
    return;
  }

  await lockProfileFollowCountUpdates(executor);
  await executor.execute(sql`select id from profile where id = ${profileId} for no key update`);
  await executor
    .update(Profiles)
    .set({
      ...(followersCount === undefined ? {} : { followersCount }),
      ...(followingCount === undefined ? {} : { followingCount }),
    })
    .where(eq(Profiles.id, profileId));
};

export const createProfileFollow = async ({
  followerProfileId,
  followeeProfileId,
  activityPubMetadata,
  deletePendingRequest,
}: CreateProfileFollowInput): Promise<CreateProfileFollowResult> => {
  return await db.transaction(async (tx) => {
    await lockProfileFollowCountUpdates(tx);

    const inserted = await tx
      .insert(ProfileFollows)
      .values({
        followerProfileId,
        followeeProfileId,
      })
      .onConflictDoNothing({
        target: [ProfileFollows.followerProfileId, ProfileFollows.followeeProfileId],
      })
      .returning()
      .then(first);

    if (!inserted) {
      if (deletePendingRequest) {
        await tx
          .delete(ProfileFollowRequests)
          .where(
            and(
              eq(ProfileFollowRequests.followerProfileId, followerProfileId),
              eq(ProfileFollowRequests.followeeProfileId, followeeProfileId),
            ),
          );
      }

      const existing = await tx
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, followerProfileId),
            eq(ProfileFollows.followeeProfileId, followeeProfileId),
          ),
        )
        .limit(1)
        .then(firstOrThrow);

      return { created: false, profileFollow: existing };
    }

    await tx
      .update(Profiles)
      .set({ followingCount: sql<number>`${Profiles.followingCount} + 1` })
      .where(eq(Profiles.id, followerProfileId));
    await tx
      .update(Profiles)
      .set({ followersCount: sql<number>`${Profiles.followersCount} + 1` })
      .where(eq(Profiles.id, followeeProfileId));

    if (deletePendingRequest) {
      await tx
        .delete(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, followerProfileId),
            eq(ProfileFollowRequests.followeeProfileId, followeeProfileId),
          ),
        );
    }

    if (!activityPubMetadata) {
      return { created: true, profileFollow: inserted };
    }

    const metadata =
      typeof activityPubMetadata === 'function'
        ? activityPubMetadata(inserted)
        : activityPubMetadata;
    const profileFollow = await tx
      .update(ProfileFollows)
      .set(metadata)
      .where(eq(ProfileFollows.id, inserted.id))
      .returning()
      .then(firstOrThrow);

    return { created: true, profileFollow };
  });
};

type DeleteProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
};

export const deleteProfileFollow = async ({
  followerProfileId,
  followeeProfileId,
}: DeleteProfileFollowInput): Promise<ProfileFollowRow | null> => {
  return await db.transaction(async (tx) => {
    await lockProfileFollowCountUpdates(tx);

    const deleted = await tx
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, followerProfileId),
          eq(ProfileFollows.followeeProfileId, followeeProfileId),
        ),
      )
      .returning()
      .then(first);

    if (!deleted) {
      return null;
    }

    await tx
      .update(Profiles)
      .set({
        followingCount: sql<number>`greatest(${Profiles.followingCount} - 1, 0)`,
      })
      .where(eq(Profiles.id, deleted.followerProfileId));
    await tx
      .update(Profiles)
      .set({
        followersCount: sql<number>`greatest(${Profiles.followersCount} - 1, 0)`,
      })
      .where(eq(Profiles.id, deleted.followeeProfileId));

    return deleted;
  });
};

export const backfillProfileFollowCounts = async () => {
  await db.execute(sql`
    update profile
    set
      followers_count = (
        select count(*)::int
        from profile_follow
        where profile_follow.followee_profile_id = profile.id
      ),
      following_count = (
        select count(*)::int
        from profile_follow
        where profile_follow.follower_profile_id = profile.id
      )
  `);
};
