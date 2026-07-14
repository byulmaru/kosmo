import { AccountProfiles, db, Instances, Profiles } from '@kosmo/core/db';
import { and, asc, eq, getColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { visibleProfileWhere } from '@/profile/visibility';
import { Profile } from '../ref';

builder.objectField(Account, 'profiles', (t) =>
  t.field({
    type: [Profile],
    resolve: async (account) => {
      return db
        .select(getColumns(Profiles))
        .from(Profiles)
        .innerJoin(
          AccountProfiles,
          and(
            eq(AccountProfiles.profileId, Profiles.id),
            eq(AccountProfiles.accountId, account.id),
          ),
        )
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(visibleProfileWhere({ profile: Profiles, instance: Instances }))
        .orderBy(asc(Profiles.createdAt));
    },
  }),
);
