import { followRequestService } from '@kosmo/core/follow-request/db';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow } from '../ref';

const FollowRequestRemovalPayload = builder.simpleObject('FollowRequestRemovalPayload', {
  fields: (field) => ({
    profileFollowRequestId: field.id(),
    profile: field.field({ type: Profile }),
  }),
});

builder.mutationField('approveFollowRequest', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('ApproveFollowRequestPayload', {
      fields: (field) => ({
        profileFollowRequestId: field.id(),
        profileFollow: field.field({ type: ProfileFollow }),
        profile: field.field({ type: Profile }),
      }),
    }),
    input: { id: t.input.id({ validate: z.uuid() }) },
    resolve: async (_, { input }, ctx) => {
      const result = await followRequestService.approve({
        requestId: input.id,
        actorProfileId: ctx.session.profileId,
      });
      return {
        profileFollowRequestId: result.request.id,
        profileFollow: result.follow,
        profile: result.request.followerProfileId,
      };
    },
  }),
);

builder.mutationField('rejectFollowRequest', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: FollowRequestRemovalPayload,
    input: { id: t.input.id({ validate: z.uuid() }) },
    resolve: async (_, { input }, ctx) => {
      const request = await followRequestService.reject({
        requestId: input.id,
        actorProfileId: ctx.session.profileId,
      });
      return { profileFollowRequestId: request.id, profile: request.followerProfileId };
    },
  }),
);

builder.mutationField('cancelFollowRequest', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: FollowRequestRemovalPayload,
    input: { id: t.input.id({ validate: z.uuid() }) },
    resolve: async (_, { input }, ctx) => {
      const request = await followRequestService.cancel({
        requestId: input.id,
        actorProfileId: ctx.session.profileId,
      });
      return { profileFollowRequestId: request.id, profile: request.followeeProfileId };
    },
  }),
);
