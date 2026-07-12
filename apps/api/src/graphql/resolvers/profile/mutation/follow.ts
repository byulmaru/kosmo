import { ConflictError } from '@kosmo/core/error';
import { createProfileFollow } from '@kosmo/core/services';
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
      const result = await createProfileFollow({
        followerProfileId: ctx.session.profileId,
        followeeProfileId: input.id,
      }).catch((error: unknown) => {
        if (error instanceof ConflictError) {
          throw new ConflictError({ message: error.message, field: 'id' });
        }
        throw error;
      });

      return result.kind === 'follow'
        ? { profile: input.id, profileFollow: result.profileFollow, profileFollowRequest: null }
        : {
            profile: input.id,
            profileFollow: null,
            profileFollowRequest: result.profileFollowRequest,
          };
    },
  }),
);
