import { db, firstOrThrowWith, ProfileFollows, Profiles } from '@kosmo/shared/db';
import { ProfileState } from '@kosmo/shared/enums';
import { and, eq } from 'drizzle-orm';
import { ForbiddenError, NotFoundError } from '@/errors';
import { getActorProfileId } from '@/utils/profile';
import { builder } from '../builder';
import { Profile } from '../objects';

builder.mutationFields((t) => ({
  followProfile: t.withAuth({ scope: 'relationship' }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
      actorProfileId: t.input.string({ required: false }),
    },
    resolve: async (_, { input }, ctx) => {
      const actorProfileId = await getActorProfileId({ ctx, actorProfileId: input.actorProfileId });

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

  unfollowProfile: t.withAuth({ scope: 'relationship' }).fieldWithInput({
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
}));
