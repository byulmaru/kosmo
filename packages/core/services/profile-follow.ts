import { and, eq, sql } from 'drizzle-orm';
import { db, first, firstOrThrowWith, ProfileFollows, Profiles } from '../db';
import { ProfileFollowPolicy, ProfileState } from '../enums';
import { ConflictError, NotFoundError } from '../error';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

type ProfileFollowInput = {
  followerProfileId: string;
  followeeProfileId: string;
};

export const createProfileFollow = async ({
  followerProfileId,
  followeeProfileId,
}: ProfileFollowInput): Promise<{ created: boolean; profileFollow: ProfileFollowRow }> =>
  db.transaction(async (tx) => {
    const target = await tx
      .select({ followPolicy: Profiles.followPolicy, id: Profiles.id })
      .from(Profiles)
      .where(and(eq(Profiles.id, followeeProfileId), eq(Profiles.state, ProfileState.ACTIVE)))
      .limit(1)
      .for('update')
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

    if (existing) {
      return { created: false, profileFollow: existing };
    }
    if (target.followPolicy !== ProfileFollowPolicy.OPEN) {
      throw new ConflictError({ message: 'Profile requires follow request' });
    }

    const inserted = await tx
      .insert(ProfileFollows)
      .values({ followerProfileId, followeeProfileId: target.id })
      .onConflictDoNothing()
      .returning()
      .then(first);

    if (!inserted) {
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
      return { created: false, profileFollow: concurrent };
    }

    await tx
      .update(Profiles)
      .set({ followingCount: sql`${Profiles.followingCount} + 1` })
      .where(eq(Profiles.id, followerProfileId));
    await tx
      .update(Profiles)
      .set({ followersCount: sql`${Profiles.followersCount} + 1` })
      .where(eq(Profiles.id, target.id));

    return { created: true, profileFollow: inserted };
  });

export const unfollowProfile = async ({
  followerProfileId,
  followeeProfileId,
}: ProfileFollowInput): Promise<{ profileId: string; profileFollowId: string | null }> =>
  db.transaction(async (tx) => {
    const target = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .where(and(eq(Profiles.id, followeeProfileId), eq(Profiles.state, ProfileState.ACTIVE)))
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

    return { profileId: target.id, profileFollowId: deleted?.id ?? null };
  });
