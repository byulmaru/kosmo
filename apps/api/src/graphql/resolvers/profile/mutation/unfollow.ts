import { db, firstOrThrowWith, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: 'ID',
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    errors: {
      types: [NotFoundError],
      dataField: { name: 'profileId' },
    },
    resolve: async (_, { input }, ctx) => {
      const targetProfile = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(and(eq(Profiles.id, input.id), eq(Profiles.state, ProfileState.ACTIVE)))
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      await db
        .delete(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, ctx.session.profileId),
            eq(ProfileFollows.followeeProfileId, targetProfile.id),
          ),
        );

      return targetProfile.id;
    },
  }),
);
