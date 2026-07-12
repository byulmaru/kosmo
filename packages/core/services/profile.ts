import { and, eq, exists, sql } from 'drizzle-orm';
import { db, first, ProfileFollows, Profiles, Sessions } from '../db';
import { ProfileState } from '../enums';
import { NotFoundError } from '../error';

export const disableProfile = async (profileId: string) => {
  await db.transaction(async (tx) => {
    const disabled = await tx
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(and(eq(Profiles.id, profileId), eq(Profiles.state, ProfileState.ACTIVE)))
      .returning({ id: Profiles.id })
      .then(first);

    if (!disabled) {
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
  });
};
