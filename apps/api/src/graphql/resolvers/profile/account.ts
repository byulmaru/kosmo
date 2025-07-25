import { MAX_PROFILE_COUNT } from '@kosmo/shared/const';
import {
  ApplicationGrantProfiles,
  ApplicationGrants,
  db,
  ProfileAccounts,
  Profiles,
} from '@kosmo/shared/db';
import { ProfileState } from '@kosmo/shared/enums';
import { and, asc, count, eq, getTableColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account, Count, Profile } from '@/graphql/objects';

builder.objectFields(Account, (t) => ({
  profiles: t.withAuth({ session: true }).field({
    type: [Profile],
    resolve: async (account) => {
      const profileIds = await db
        .select({
          id: ApplicationGrantProfiles.profileId,
        })
        .from(ApplicationGrants)
        .innerJoin(
          ApplicationGrantProfiles,
          eq(ApplicationGrants.id, ApplicationGrantProfiles.applicationGrantId),
        )
        .innerJoin(Profiles, eq(ApplicationGrantProfiles.profileId, Profiles.id))
        .where(
          and(eq(ApplicationGrants.accountId, account.id), eq(Profiles.state, ProfileState.ACTIVE)),
        )
        .orderBy(asc(ApplicationGrantProfiles.profileId))
        .then((rows) => rows.map((row) => row.id));

      if (profileIds.includes(null)) {
        return await db
          .select(getTableColumns(Profiles))
          .from(Profiles)
          .innerJoin(ProfileAccounts, eq(Profiles.id, ProfileAccounts.profileId))
          .where(
            and(eq(ProfileAccounts.accountId, account.id), eq(Profiles.state, ProfileState.ACTIVE)),
          )
          .orderBy(asc(Profiles.id));
      } else {
        return profileIds as string[];
      }
    },
  }),

  profileCount: t.withAuth({ session: true }).field({
    type: Count,
    resolve: (account) => ({
      currentResolver: async () => {
        return await db
          .select({ profileCount: count() })
          .from(ProfileAccounts)
          .where(eq(ProfileAccounts.accountId, account.id))
          .then((rows) => rows[0]?.profileCount ?? 0);
      },
      maxResolver: () => MAX_PROFILE_COUNT,
    }),
  }),
}));
