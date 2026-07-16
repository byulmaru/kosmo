import { builder } from '@/graphql/builder';
import { unfollowProfile } from '@/profile/follow-service';
import { Profile, ProfileFollow } from '../ref';

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('UnfollowProfilePayload', {
      fields: (field) => ({
        followeeProfile: field.field({ nullable: true, type: Profile }),
        followerProfile: field.field({ type: Profile }),
        profileFollowId: field.globalID({
          nullable: true,
          resolve: (payload) => {
            const { profileFollowId } = payload as { profileFollowId: string | null };
            return profileFollowId ? { id: profileFollowId, type: ProfileFollow } : null;
          },
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Profile }),
    },
    resolve: (_, { input }, ctx) =>
      unfollowProfile({
        followerProfileId: ctx.session.profileId,
        followeeProfileId: input.id.id,
      }),
  }),
);
