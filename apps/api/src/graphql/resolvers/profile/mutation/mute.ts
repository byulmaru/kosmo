import { muteProfile, unmuteProfile } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Profile, ProfileMute } from '../ref';

builder.mutationField('muteProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('MuteProfilePayload', {
      fields: (field) => ({
        profileMute: field.field({ type: ProfileMute }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Profile }),
    },
    resolve: async (_, { input }, ctx) => ({
      profileMute: await muteProfile({
        ownerProfileId: ctx.session.profileId,
        targetProfileId: input.id.id,
      }),
    }),
  }),
);

builder.mutationField('unmuteProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('UnmuteProfilePayload', {
      fields: (field) => ({
        profileMuteId: field.globalID({
          nullable: true,
          resolve: (payload) => {
            const { profileMuteId } = payload as { profileMuteId: string | null };
            return profileMuteId ? { id: profileMuteId, type: ProfileMute } : null;
          },
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: ProfileMute }),
    },
    resolve: async (_, { input }, ctx) => {
      const profileMute = await unmuteProfile({
        ownerProfileId: ctx.session.profileId,
        profileMuteId: input.id.id,
      });

      return { profileMuteId: profileMute?.id ?? null };
    },
  }),
);
