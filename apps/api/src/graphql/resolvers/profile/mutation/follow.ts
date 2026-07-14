import { ConflictError } from '@kosmo/core/error';
import { followProfile } from '@kosmo/core/services';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow } from '../ref';

builder.mutationField('followProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('FollowProfilePayload', {
      fields: (field) => ({
        followeeProfile: field.field({ type: Profile }),
        followerProfile: field.field({ type: Profile }),
        profileFollow: field.field({ type: ProfileFollow }),
      }),
    }),
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: (_, { input }, ctx) =>
      followProfile({
        followerProfileId: ctx.session.profileId,
        followeeProfileId: input.id,
      }).catch((error: unknown) => {
        if (error instanceof ConflictError) {
          throw new ConflictError({ message: error.message, field: 'id' });
        }
        throw error;
      }),
  }),
);
