import {
  approveProfileFollowRequest,
  cancelProfileFollowRequest,
  rejectProfileFollowRequest,
} from '@kosmo/core/services';
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
      const result = await approveProfileFollowRequest({
        requestId: input.id,
        actorProfileId: ctx.session.profileId,
      });
      return {
        profileFollowRequestId: result.request.id,
        profileFollow: result.profileFollow,
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
      const request = await rejectProfileFollowRequest({
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
      const request = await cancelProfileFollowRequest({
        requestId: input.id,
        actorProfileId: ctx.session.profileId,
      });
      return { profileFollowRequestId: request.id, profile: request.followeeProfileId };
    },
  }),
);
