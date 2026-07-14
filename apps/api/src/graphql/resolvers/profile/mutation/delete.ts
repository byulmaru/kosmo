import {
  AccountProfiles,
  db,
  firstOrThrowWith,
  Instances,
  Profiles,
  Sessions,
} from '@kosmo/core/db';
import { AccountProfileRole, ProfileState } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';

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
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(Profiles.id, input.id),
            eq(AccountProfiles.accountId, ctx.session.accountId),
            visibleProfileWhere({ profile: Profiles, instance: Instances }),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      if (profile.actorRole !== AccountProfileRole.OWNER) {
        throw new PermissionDeniedError('Profile owner permission is required');
      }

      await db.transaction(async (tx) => {
        await tx
          .update(Profiles)
          .set({ state: ProfileState.DISABLED })
          .where(eq(Profiles.id, input.id));

        await tx
          .update(Sessions)
          .set({ activeProfileId: null })
          .where(eq(Sessions.activeProfileId, input.id));
      });

      return { profileId: profile.id };
    },
  }),
);
