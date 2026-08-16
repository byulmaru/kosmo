import { db } from '@kosmo/core/db';
import { PostVisibility, ProfileFollowPolicy } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { updateProfile } from '@kosmo/core/services';
import { profileBioSchema, profileTagsInputSchema } from '@kosmo/core/validation';
import { builder } from '@/graphql/builder';
import { Media } from '../../media/ref';
import { Profile } from '../ref';

builder.mutationField('updateProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('UpdateProfilePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
      }),
    }),
    input: {
      displayName: t.input.string({ required: false }),
      bio: t.input.string({ required: false, validate: profileBioSchema.optional() }),
      followPolicy: t.input.field({ type: ProfileFollowPolicy, required: false }),
      defaultPostVisibility: t.input.field({ type: PostVisibility, required: false }),
      tags: t.input.stringList({ required: false, validate: profileTagsInputSchema }),
      avatarId: t.input.globalID({ for: Media, required: false }),
      headerId: t.input.globalID({ for: Media, required: false }),
    },
    resolve: async (_, { input }, ctx) => {
      try {
        const result = await updateProfile(
          {
            accountId: ctx.session.accountId,
            profileId: ctx.session.profileId,
            displayName: input.displayName ?? undefined,
            bio: input.bio,
            followPolicy: input.followPolicy ?? undefined,
            defaultPostVisibility: input.defaultPostVisibility,
            tags: input.tags,
            avatarMediaId: input.avatarId === undefined ? undefined : (input.avatarId?.id ?? null),
            headerMediaId: input.headerId === undefined ? undefined : (input.headerId?.id ?? null),
          },
          db,
        );
        await result.postCommit();

        return {
          profile: result.profile,
        };
      } catch (error) {
        if (
          error instanceof ValidationError &&
          (error.field === 'avatarMediaId' || error.field === 'headerMediaId')
        ) {
          throw new ValidationError(error.message, {
            field: error.field.replace(/MediaId$/, 'Id'),
          });
        }
        throw error;
      }
    },
  }),
);
