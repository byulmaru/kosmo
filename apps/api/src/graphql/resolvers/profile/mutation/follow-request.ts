import { db, firstOrThrowWith, ProfileFollowRequests } from '@kosmo/core/db';
import { NotFoundError } from '@kosmo/core/error';
import { executeProfileFollowPairTransition } from '@kosmo/core/temporal/follow-command';
import { and, eq } from 'drizzle-orm';
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
    resolve: async (_, { input }, ctx) => {
      const request = await db
        .select({
          id: ProfileFollowRequests.id,
          followerProfileId: ProfileFollowRequests.followerProfileId,
          followeeProfileId: ProfileFollowRequests.followeeProfileId,
        })
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.id, input.id.id),
            eq(ProfileFollowRequests.followeeProfileId, ctx.session.profileId),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
      const result = await executeProfileFollowPairTransition({
        pair: {
          followerProfileId: request.followerProfileId,
          followeeProfileId: request.followeeProfileId,
        },
        command: {
          kind: 'APPROVE',
          followerProfileId: request.followerProfileId,
          followeeProfileId: request.followeeProfileId,
          actorProfileId: ctx.session.profileId,
          expectedRowId: request.id,
          origin: 'LOCAL',
        },
      });
      return {
        followeeProfile: result.followeeProfile,
        followerProfile: result.followerProfile,
        profileFollow: result.profileFollow!,
        profileFollowRequestId: result.result.profileFollowRequestId!,
      };
    },
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
    resolve: async (_, { input }, ctx) => {
      const request = await db
        .select({
          id: ProfileFollowRequests.id,
          followerProfileId: ProfileFollowRequests.followerProfileId,
          followeeProfileId: ProfileFollowRequests.followeeProfileId,
        })
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.id, input.id.id),
            eq(ProfileFollowRequests.followeeProfileId, ctx.session.profileId),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
      const result = await executeProfileFollowPairTransition({
        pair: {
          followerProfileId: request.followerProfileId,
          followeeProfileId: request.followeeProfileId,
        },
        command: {
          kind: 'REJECT',
          followerProfileId: request.followerProfileId,
          followeeProfileId: request.followeeProfileId,
          actorProfileId: ctx.session.profileId,
          expectedRowId: request.id,
          origin: 'LOCAL',
        },
      });
      return {
        followeeProfile: result.followeeProfile,
        profileFollowRequestId: result.result.profileFollowRequestId!,
      };
    },
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
    resolve: async (_, { input }, ctx) => {
      const request = await db
        .select({
          id: ProfileFollowRequests.id,
          followerProfileId: ProfileFollowRequests.followerProfileId,
          followeeProfileId: ProfileFollowRequests.followeeProfileId,
        })
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.id, input.id.id),
            eq(ProfileFollowRequests.followerProfileId, ctx.session.profileId),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile follow request not found')));
      const result = await executeProfileFollowPairTransition({
        pair: {
          followerProfileId: request.followerProfileId,
          followeeProfileId: request.followeeProfileId,
        },
        command: {
          kind: 'CANCEL',
          followerProfileId: request.followerProfileId,
          followeeProfileId: request.followeeProfileId,
          actorProfileId: ctx.session.profileId,
          expectedRowId: request.id,
          origin: 'LOCAL',
        },
      });
      return {
        followerProfile: result.followerProfile,
        profileFollowRequestId: result.result.profileFollowRequestId!,
      };
    },
  }),
);
