import { and, eq } from 'drizzle-orm';
import { db, first, Profiles, Sessions } from '../db';
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
      .update(Sessions)
      .set({ activeProfileId: null })
      .where(eq(Sessions.activeProfileId, profileId));
  });
};
