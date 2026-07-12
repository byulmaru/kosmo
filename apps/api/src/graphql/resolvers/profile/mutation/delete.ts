import { AccountProfiles, db, firstOrThrowWith, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, ProfileState } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { disableProfile } from '@kosmo/core/services';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';

builder.mutationField('deleteProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('DeleteProfilePayload', {
      fields: (field) => ({
        profileId: field.id(),
      }),
    }),
    input: {
      id: t.input.id({ required: true }),
    },
    resolve: async (_, { input }, ctx) => {
      const profile = await db
        .select({ id: Profiles.id, actorRole: AccountProfiles.role })
        .from(Profiles)
        .innerJoin(AccountProfiles, eq(AccountProfiles.profileId, Profiles.id))
        .where(
          and(
            eq(Profiles.id, input.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(AccountProfiles.accountId, ctx.session.accountId),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      if (profile.actorRole !== AccountProfileRole.OWNER) {
        throw new PermissionDeniedError('Profile owner permission is required');
      }

      await disableProfile(input.id);

      return { profileId: profile.id };
    },
  }),
);
