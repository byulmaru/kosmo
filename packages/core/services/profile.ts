import { and, DrizzleQueryError, eq, exists, sql } from 'drizzle-orm';
import { invalidateHomeTimelines } from '../home-timeline/cache';
import { first, getDatabaseConnection, ProfileFollows, Profiles, Sessions } from '../db';
import { ProfileState } from '../enums';
import { NotFoundError } from '../error';
import type { Database } from '../db';

const disableProfileOnce = (profileId: string, handle?: Database) =>
  getDatabaseConnection(handle).transaction(async (tx) => {
    const disabled = await tx
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(and(eq(Profiles.id, profileId), eq(Profiles.state, ProfileState.ACTIVE)))
      .returning({ id: Profiles.id })
      .then(first);

    if (!disabled) {
      const existing = await tx
        .select({ state: Profiles.state })
        .from(Profiles)
        .where(eq(Profiles.id, profileId))
        .then(first);

      if (existing?.state === ProfileState.DISABLED) {
        return false;
      }

      throw new NotFoundError('Profile not found');
    }

    await tx
      .update(Profiles)
      .set({ followersCount: sql`greatest(${Profiles.followersCount} - 1, 0)` })
      .where(
        and(
          eq(Profiles.state, ProfileState.ACTIVE),
          exists(
            tx
              .select({ id: ProfileFollows.id })
              .from(ProfileFollows)
              .where(
                and(
                  eq(ProfileFollows.followerProfileId, profileId),
                  eq(ProfileFollows.followeeProfileId, Profiles.id),
                ),
              ),
          ),
        ),
      );
    await tx
      .update(Profiles)
      .set({ followingCount: sql`greatest(${Profiles.followingCount} - 1, 0)` })
      .where(
        and(
          eq(Profiles.state, ProfileState.ACTIVE),
          exists(
            tx
              .select({ id: ProfileFollows.id })
              .from(ProfileFollows)
              .where(
                and(
                  eq(ProfileFollows.followerProfileId, Profiles.id),
                  eq(ProfileFollows.followeeProfileId, profileId),
                ),
              ),
          ),
        ),
      );

    await tx
      .update(Sessions)
      .set({ activeProfileId: null })
      .where(eq(Sessions.activeProfileId, profileId));
    return true;
  });

export const disableProfile = async (profileId: string, handle?: Database): Promise<void> => {
  let disabled: boolean;
  try {
    disabled = await disableProfileOnce(profileId, handle);
  } catch (error) {
    const deadlock =
      error instanceof DrizzleQueryError &&
      error.cause &&
      'code' in error.cause &&
      error.cause.code === '40P01';

    if (!deadlock) {
      throw error;
    }

    disabled = await disableProfileOnce(profileId, handle);
  }

  if (disabled) {
    void invalidateHomeTimelines().catch((error: unknown) => {
      console.error('Profile disable Home timeline invalidation failed', { error, profileId });
    });
  }
};
