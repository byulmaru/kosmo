import { AccountProfileRole } from '@kosmo/core/enums';
import { pinProfilePost, reorderProfilePost, unpinProfilePost } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { postProfilePinLoader } from '@/graphql/resolvers/post/loader/profile-pin';
import { Profile } from '../ref';

builder.mutationField('pinProfilePost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('PinProfilePostPayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        changed: field.boolean(),
        post: field.field({ type: Post, nullable: true }),
      }),
    }),
    input: {
      postId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await pinProfilePost({
        profileId: ctx.session.profile.id,
        postId: input.postId.id,
      });
      postProfilePinLoader(ctx).clear(input.postId.id);

      return { changed: result.changed, profile: ctx.session.profile.id, post: input.postId.id };
    },
  }),
);

builder.mutationField('unpinProfilePost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('UnpinProfilePostPayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        changed: field.boolean(),
        post: field.field({ type: Post, nullable: true }),
      }),
    }),
    input: {
      postId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await unpinProfilePost({
        profileId: ctx.session.profile.id,
        postId: input.postId.id,
      });
      postProfilePinLoader(ctx).clear(input.postId.id);

      return { changed: result.changed, profile: ctx.session.profile.id, post: input.postId.id };
    },
  }),
);

builder.mutationField('reorderProfilePost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('ReorderProfilePostPayload', {
      fields: (field) => ({ profile: field.field({ type: Profile }), changed: field.boolean() }),
    }),
    input: {
      postId: t.input.globalID({ for: Post }),
      beforePostId: t.input.globalID({ for: Post, required: false }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await reorderProfilePost({
        profileId: ctx.session.profile.id,
        postId: input.postId.id,
        beforePostId: input.beforePostId?.id,
      });
      return { changed: result.changed, profile: ctx.session.profile.id };
    },
  }),
);
