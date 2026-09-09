import {
  AccountProfiles,
  db,
  firstOrThrow,
  firstOrThrowWith,
  Instances,
  Profiles,
  Sessions,
} from '@kosmo/core/db';
import { NotFoundError } from '@kosmo/core/error';
import { RequestCache } from '@pothos/plugin-scope-auth';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Session } from '@/graphql/resolvers/session/ref';
import { visibleProfileWhere } from '@/profile/visibility';
import { Profile } from '../ref';

builder.mutationField('selectProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('SelectProfilePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        session: field.field({ type: Session }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Profile }),
    },
    resolve: async (_, { input }, ctx) => {
      const profile = await db.transaction(async (tx) => {
        const profile = await tx
          .select({ profile: Profiles, role: AccountProfiles.role })
          .from(Profiles)
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .innerJoin(
            AccountProfiles,
            and(
              eq(AccountProfiles.profileId, Profiles.id),
              eq(AccountProfiles.accountId, ctx.session.accountId),
            ),
          )
          .where(
            and(
              eq(Profiles.id, input.id.id),
              visibleProfileWhere({ profile: Profiles, instance: Instances }),
            ),
          )
          .limit(1)
          .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

        await tx
          .update(Sessions)
          .set({ activeProfileId: profile.profile.id })
          .where(eq(Sessions.id, ctx.session.id))
          .returning()
          .then(firstOrThrow);

        return profile;
      });

      ctx.session.profile = { id: profile.profile.id, role: profile.role };
      RequestCache.clearForContext(ctx);

      return { profile: profile.profile, session: ctx.session.id };
    },
  }),
);
