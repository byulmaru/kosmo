import { AccountProfiles, db, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { and, asc, eq, getColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
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
        .where(eq(Profiles.state, ProfileState.ACTIVE))
        .orderBy(asc(Profiles.createdAt));
    },
  }),
);
