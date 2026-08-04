import { AccountProfiles, db, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { and, eq, inArray } from 'drizzle-orm';
import type { PostVisibility } from '@kosmo/core/enums';
import type { UserContext } from '@/context';

type DefaultPostVisibilityRow = {
  profileId: string;
  defaultPostVisibility: PostVisibility | null;
};

export const profileDefaultPostVisibilityLoader = (ctx: UserContext) =>
  ctx.loader<string, DefaultPostVisibilityRow, string, true>({
    name: 'profile.defaultPostVisibility',
    nullable: true,
    load: async (profileIds) => {
      const accountId = ctx.session?.accountId;
      if (!accountId) {
        return [];
      }

      return db
        .select({
          profileId: Profiles.id,
          defaultPostVisibility: Profiles.defaultPostVisibility,
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
