import { AccountProfileRole } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { pinProfilePost, replaceCurrentProfilePin, unpinProfilePost } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile } from '../ref';

const assertSelectedProfile = (profileId: string, selectedProfileId: string) => {
  if (profileId !== selectedProfileId) {
    throw new PermissionDeniedError('Selected Profile is required');
  }
};

builder.mutationField('pinProfilePost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('PinProfilePostPayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        changed: field.boolean(),
      }),
    }),
    input: {
      profileId: t.input.globalID({ for: Profile }),
      postId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      assertSelectedProfile(input.profileId.id, ctx.session.profile.id);
      const result = await pinProfilePost({
        profileId: input.profileId.id,
        postId: input.postId.id,
      });

      return { changed: result.changed, profile: input.profileId.id };
    },
  }),
);

builder.mutationField('unpinProfilePost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('UnpinProfilePostPayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        changed: field.boolean(),
      }),
    }),
    input: {
      profileId: t.input.globalID({ for: Profile }),
      postId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      assertSelectedProfile(input.profileId.id, ctx.session.profile.id);
      const result = await unpinProfilePost({
        profileId: input.profileId.id,
        postId: input.postId.id,
      });

      return { changed: result.changed, profile: input.profileId.id };
    },
  }),
);

builder.mutationField('replaceCurrentProfilePin', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('ReplaceCurrentProfilePinPayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        changed: field.boolean(),
      }),
    }),
    input: {
      profileId: t.input.globalID({ for: Profile }),
      expectedCurrentPostId: t.input.globalID({ for: Post }),
      newPostId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      assertSelectedProfile(input.profileId.id, ctx.session.profile.id);
      const result = await replaceCurrentProfilePin({
        expectedCurrentPostId: input.expectedCurrentPostId.id,
        newPostId: input.newPostId.id,
        profileId: input.profileId.id,
      });

      return { changed: result.changed, profile: input.profileId.id };
    },
  }),
);
