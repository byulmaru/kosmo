import { followRequestService } from '@kosmo/core/follow-request/db';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow, ProfileFollowRequest } from '../ref';

builder.mutationField('followProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('FollowProfilePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        profileFollow: field.field({ type: ProfileFollow, nullable: true }),
        profileFollowRequest: field.field({ type: ProfileFollowRequest, nullable: true }),
      }),
    }),
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await followRequestService.followProfile({
        followerProfileId: ctx.session.profileId,
        followeeProfileId: input.id,
      });

      return result.kind === 'follow'
        ? { profile: input.id, profileFollow: result.follow, profileFollowRequest: null }
        : { profile: input.id, profileFollow: null, profileFollowRequest: result.request };
    },
  }),
);
