import { MAX_PROFILE_COUNT } from '@kosmo/const';
import { db, first, ProfileAccounts, Profiles } from '@kosmo/db';
import { ProfileAccountRole } from '@kosmo/enum';
import { ProfileManager } from '@kosmo/manager';
import { and, eq } from 'drizzle-orm';
import { defineService } from '../define';

type CreateParams = {
  handle: string;
  instanceId: string;
  accountId?: string;
};

export const create = defineService(
  'profile:create',
  async ({ accountId, instanceId, handle }: CreateParams) => {
    if (accountId) {
      const profileCount = await db.$count(
        ProfileAccounts,
        eq(ProfileAccounts.accountId, accountId),
      );

      if (profileCount >= MAX_PROFILE_COUNT) {
        throw new Error('PROFILE_LIMIT_EXCEEDED');
      }
    }

    const handleConflictedProfile = await db
      .select({ id: Profiles.id })
      .from(Profiles)
      .where(
        and(
          eq(Profiles.normalizedHandle, handle.toLowerCase()),
          eq(Profiles.instanceId, instanceId),
        ),
      )
      .then(first);

    if (handleConflictedProfile) {
      throw new Error('HANDLE_CONFLICT');
    }

    return await db.transaction(async (tx) => {
      const { id: profileId } = await ProfileManager.create({
        tx,
        data: {
          handle,
          instanceId,
        },
      });

      if (accountId) {
        await tx.insert(ProfileAccounts).values({
          accountId,
          profileId,
          role: ProfileAccountRole.OWNER,
        });
      }

      return profileId;
    });
  },
);
