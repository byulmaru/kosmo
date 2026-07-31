import { AccountProfiles, Accounts, db, first, Instances, Profiles } from '@kosmo/core/db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  ProfileState,
} from '@kosmo/core/enums';
import { and, eq, getColumns, ne } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.queryField('selectedProfileForEdit', (t) =>
  t.withAuth({ login: true }).field({
    type: Profile,
    nullable: true,
    resolve: (_, __, ctx) => {
      const profileId = ctx.session.profileId;
      if (!profileId) {
        return null;
      }

      return db
        .select(getColumns(Profiles))
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .innerJoin(
          AccountProfiles,
          and(
            eq(AccountProfiles.profileId, Profiles.id),
            eq(AccountProfiles.accountId, ctx.session.accountId),
          ),
        )
        .innerJoin(Accounts, eq(Accounts.id, AccountProfiles.accountId))
        .where(
          and(
            eq(Profiles.id, profileId),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Instances.kind, InstanceKind.LOCAL),
            ne(Instances.state, InstanceState.SUSPENDED),
            eq(AccountProfiles.role, AccountProfileRole.OWNER),
            eq(Accounts.state, AccountState.ACTIVE),
          ),
        )
        .limit(1)
        .then(first);
    },
    unauthorizedResolver: () => null,
  }),
);
