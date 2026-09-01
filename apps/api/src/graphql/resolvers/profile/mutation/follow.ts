import { ConflictError } from '@kosmo/core/error';
import { followProfile } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow, ProfileFollowRequest } from '../ref';

const ProfileFollowResult = builder.unionType('ProfileFollowResult', {
  types: [ProfileFollow, ProfileFollowRequest],
  resolveType: (result) => {
    if (
      '__typename' in result &&
      (result.__typename === 'ProfileFollow' || result.__typename === 'ProfileFollowRequest')
    ) {
      return result.__typename;
    }

    return null;
  },
});

builder.mutationField('followProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('FollowProfilePayload', {
      fields: (field) => ({
        followeeProfile: field.field({ type: Profile }),
        followerProfile: field.field({ type: Profile }),
        result: field.field({ type: ProfileFollowResult }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Profile }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await followProfile({
        followerProfileId: ctx.session.profileId,
        followeeProfileId: input.id.id,
      }).catch((error: unknown) => {
        if (error instanceof ConflictError) {
          throw new ConflictError({ message: error.message, field: 'id' });
        }
        throw error;
      });

      return {
        followeeProfile: result.followeeProfile,
        followerProfile: result.followerProfile,
        result:
          result.result.kind === 'ESTABLISHED'
            ? { ...result.result.profileFollow, __typename: 'ProfileFollow' as const }
            : {
                ...result.result.profileFollowRequest,
                __typename: 'ProfileFollowRequest' as const,
              },
      };
    },
  }),
);
