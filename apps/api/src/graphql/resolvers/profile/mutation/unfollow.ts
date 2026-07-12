import { unfollowProfile } from '@kosmo/core/services';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('UnfollowProfilePayload', {
      fields: (field) => ({
        followeeProfile: field.field({ type: Profile }),
        followerProfile: field.field({ type: Profile }),
        profileFollowId: field.id({ nullable: true }),
      }),
    }),
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: (_, { input }, ctx) =>
      unfollowProfile({
        followerProfileId: ctx.session.profileId,
        followeeProfileId: input.id,
      }),
  }),
);
