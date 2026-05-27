import { AccountProfiles, db, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { and, asc, eq, getColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.queryField('myProfiles', (t) =>
  t.withAuth({ login: true }).field({
    type: [Profile],
    resolve: async (_, __, ctx) => {
      return db
        .select(getColumns(Profiles))
        .from(Profiles)
        .innerJoin(
          AccountProfiles,
          and(
            eq(AccountProfiles.profileId, Profiles.id),
            eq(AccountProfiles.accountId, ctx.session.accountId),
          ),
        )
        .where(eq(Profiles.state, ProfileState.ACTIVE))
        .orderBy(asc(Profiles.createdAt));
    },
    unauthorizedResolver: () => [],
  }),
);
