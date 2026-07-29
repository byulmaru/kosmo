import { ProfileFollowPolicy } from '@kosmo/core/enums';
import { updateProfile } from '@kosmo/core/services';
import {
  profileBioSchema,
  profileDisplayNameSchema,
  profileTagsInputSchema,
} from '@kosmo/core/validation';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.mutationField('updateProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('UpdateProfilePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
      }),
    }),
    input: {
      displayName: t.input.string({
        required: false,
        validate: profileDisplayNameSchema.optional(),
      }),
      bio: t.input.string({ required: false, validate: profileBioSchema.optional() }),
      followPolicy: t.input.field({ type: ProfileFollowPolicy, required: false }),
      tags: t.input.stringList({ required: false, validate: profileTagsInputSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      const updatedProfile = await updateProfile({
        accountId: ctx.session.accountId,
        profileId: ctx.session.profileId,
        displayName: input.displayName ?? undefined,
        bio: input.bio,
        followPolicy: input.followPolicy ?? undefined,
        tags: input.tags,
      });

      return { profile: updatedProfile };
    },
  }),
);
