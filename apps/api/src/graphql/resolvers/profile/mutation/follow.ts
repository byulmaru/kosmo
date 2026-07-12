import { ConflictError } from '@kosmo/core/error';
import { createProfileFollow } from '@kosmo/core/services';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { ProfileFollow } from '../ref';

builder.mutationField('followProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('FollowProfilePayload', {
      fields: (field) => ({
        profileFollow: field.field({ type: ProfileFollow }),
      }),
    }),
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      const { profileFollow } = await createProfileFollow({
        followerProfileId: ctx.session.profileId,
        followeeProfileId: input.id,
      }).catch((error: unknown) => {
        if (error instanceof ConflictError) {
          throw new ConflictError({ message: error.message, field: 'id' });
        }
        throw error;
      });

      return { profileFollow };
    },
  }),
);
