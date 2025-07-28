import { MAX_PROFILE_COUNT } from '@kosmo/shared/const';
import {
  ApplicationGrantProfiles,
  ApplicationGrants,
  db,
  ProfileAccounts,
  Profiles,
} from '@kosmo/shared/db';
import { ProfileState } from '@kosmo/shared/enums';
import { and, asc, count, eq, getTableColumns, isNull, or } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account, Count, Profile } from '@/graphql/objects';

builder.objectFields(Account, (t) => ({
  profiles: t.withAuth({ session: true }).field({
    type: [Profile],
    resolve: async (account, _, ctx) => {
      return await db
        .selectDistinctOn([Profiles.id], getTableColumns(Profiles))
        .from(ProfileAccounts)
        .innerJoin(
          ApplicationGrants,
          and(
            eq(ProfileAccounts.accountId, ApplicationGrants.accountId),
            eq(ApplicationGrants.applicationId, ctx.session.applicationId),
          ),
        )
        .innerJoin(
          ApplicationGrantProfiles,
          eq(ApplicationGrants.id, ApplicationGrantProfiles.applicationGrantId),
        )
        .innerJoin(
          Profiles,
          or(
            eq(ApplicationGrantProfiles.profileId, Profiles.id),
            and(
              isNull(ApplicationGrantProfiles.profileId),
              eq(ProfileAccounts.profileId, Profiles.id),
            ),
          ),
        )
        .where(
          and(eq(ProfileAccounts.accountId, account.id), eq(Profiles.state, ProfileState.ACTIVE)),
        )
        .orderBy(asc(Profiles.id));
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
