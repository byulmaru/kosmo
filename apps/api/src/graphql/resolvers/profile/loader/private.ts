import { AccountProfiles, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { and, eq, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type ProfilePrivateAccessRow = {
  profileId: string;
};

export const profilePrivateAccessLoader = (ctx: UserContext) =>
  ctx.loader<string, ProfilePrivateAccessRow, string, true>({
    name: 'profile.private.access',
    nullable: true,
    load: async (profileIds) => {
      const accountId = ctx.session?.accountId;
      if (!accountId) {
        return [];
      }

      return ctx.db
        .select({
          profileId: Profiles.id,
        })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .innerJoin(
          AccountProfiles,
          and(eq(AccountProfiles.profileId, Profiles.id), eq(AccountProfiles.accountId, accountId)),
        )
        .where(and(inArray(Profiles.id, profileIds), eq(Instances.kind, InstanceKind.LOCAL)));
    },
    key: (row) => row?.profileId ?? null,
  });
