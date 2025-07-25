import { ApplicationGrantProfiles, db, firstOrThrow, Profiles, Sessions } from '@kosmo/shared/db';
import { ProfileAccountRole, ProfileState } from '@kosmo/shared/enums';
import { eq } from 'drizzle-orm';
import { ForbiddenError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { getPermittedProfileId } from '@/utils/profile';

builder.mutationField('deleteProfile', (t) =>
  t.withAuth({ scope: 'meta-profile' }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
    },

    errors: {
      types: [ForbiddenError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      const profileId = await getPermittedProfileId({
        ctx,
        actorProfileId: input.profileId,
        role: ProfileAccountRole.OWNER,
      });

      return await db.transaction(async (tx) => {
        await tx.update(Sessions).set({ profileId: null }).where(eq(Sessions.profileId, profileId));

        await tx
          .delete(ApplicationGrantProfiles)
          .where(eq(ApplicationGrantProfiles.profileId, profileId));

        return await tx
          .update(Profiles)
          .set({ state: ProfileState.DELETED })
          .where(eq(Profiles.id, profileId))
          .returning()
          .then(firstOrThrow);
      });
    },
  }),
);
