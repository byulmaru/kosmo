import {
  approveProfileFollowRequest,
  cancelProfileFollowRequest,
  rejectProfileFollowRequest,
} from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow, ProfileFollowRequest } from '../ref';

builder.mutationField('approveProfileFollowRequest', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('ApproveProfileFollowRequestPayload', {
      fields: (field) => ({
        followeeProfile: field.field({ type: Profile }),
        followerProfile: field.field({ type: Profile }),
        profileFollow: field.field({ type: ProfileFollow }),
        profileFollowRequestId: field.globalID({
          resolve: (payload) => ({
            id: (payload as { profileFollowRequestId: string }).profileFollowRequestId,
            type: ProfileFollowRequest,
          }),
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: ProfileFollowRequest }),
    },
    resolve: (_, { input }, ctx) =>
      approveProfileFollowRequest({
        actorProfileId: ctx.session.profileId,
        profileFollowRequestId: input.id.id,
      }),
  }),
);

builder.mutationField('rejectProfileFollowRequest', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('RejectProfileFollowRequestPayload', {
      fields: (field) => ({
        followeeProfile: field.field({ type: Profile }),
        profileFollowRequestId: field.globalID({
          resolve: (payload) => ({
            id: (payload as { profileFollowRequestId: string }).profileFollowRequestId,
            type: ProfileFollowRequest,
          }),
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: ProfileFollowRequest }),
    },
    resolve: (_, { input }, ctx) =>
      rejectProfileFollowRequest({
        actorProfileId: ctx.session.profileId,
        profileFollowRequestId: input.id.id,
      }),
  }),
);

builder.mutationField('cancelProfileFollowRequest', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('CancelProfileFollowRequestPayload', {
      fields: (field) => ({
        followerProfile: field.field({ type: Profile }),
        profileFollowRequestId: field.globalID({
          resolve: (payload) => ({
            id: (payload as { profileFollowRequestId: string }).profileFollowRequestId,
            type: ProfileFollowRequest,
          }),
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: ProfileFollowRequest }),
    },
    resolve: (_, { input }, ctx) =>
      cancelProfileFollowRequest({
        actorProfileId: ctx.session.profileId,
        profileFollowRequestId: input.id.id,
      }),
  }),
);
