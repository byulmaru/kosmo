import { db, firstOrThrowWith, ProfileFollows, Profiles } from '@kosmo/shared/db';
import { ProfileState } from '@kosmo/shared/enums';
import { and, eq } from 'drizzle-orm';
import { NotFoundError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { getActorProfileId } from '@/utils/profile';

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ scope: 'relationship' }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
      actorProfileId: t.input.string({ required: false }),
    },
    resolve: async (_, { input }, ctx) => {
      const actorProfileId = await getActorProfileId({ ctx, actorProfileId: input.actorProfileId });

      const targetProfile = await db
        .select()
        .from(Profiles)
        .where(and(eq(Profiles.id, input.profileId), eq(Profiles.state, ProfileState.ACTIVE)))
        .then(firstOrThrowWith(() => new NotFoundError()));

      await db
        .delete(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, actorProfileId),
            eq(ProfileFollows.followingProfileId, input.profileId),
          ),
        );

      return targetProfile;
    },
  }),
);
