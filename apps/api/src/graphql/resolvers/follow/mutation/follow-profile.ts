import { db, firstOrThrowWith, ProfileFollows, Profiles } from '@kosmo/shared/db';
import { ProfileState } from '@kosmo/shared/enums';
import { and, eq } from 'drizzle-orm';
import { ForbiddenError, NotFoundError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { getPermittedProfileId } from '@/utils/profile';

builder.mutationField('followProfile', (t) =>
  t.withAuth({ scope: 'relationship' }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
      actorProfileId: t.input.string({ required: false }),
    },

    errors: {
      types: [ForbiddenError, NotFoundError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      const actorProfileId = await getPermittedProfileId({
        ctx,
        actorProfileId: input.actorProfileId,
      });

      if (actorProfileId === input.profileId) {
        throw new ForbiddenError();
      }

      const targetProfile = await db
        .select()
        .from(Profiles)
        .where(and(eq(Profiles.id, input.profileId), eq(Profiles.state, ProfileState.ACTIVE)))
        .then(firstOrThrowWith(() => new NotFoundError()));

      await db
        .insert(ProfileFollows)
        .values({
          followerProfileId: actorProfileId,
          followingProfileId: input.profileId,
        })
        .onConflictDoNothing();

      return targetProfile;
    },
  }),
);
