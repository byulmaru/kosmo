import { AccountProfiles, db, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, asc, eq, getColumns, isNull, or } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { Profile } from '../ref';

builder.objectField(Account, 'profiles', (t) =>
  t.field({
    type: [Profile],
    resolve: async (account) => {
      const configuredLocalInstance = await resolveConfiguredLocalInstance();

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
        .where(
          and(
            eq(Profiles.state, ProfileState.ACTIVE),
            or(isNull(Profiles.instanceId), eq(Profiles.instanceId, configuredLocalInstance.id)),
          ),
        )
        .orderBy(asc(Profiles.createdAt));
    },
  }),
);
