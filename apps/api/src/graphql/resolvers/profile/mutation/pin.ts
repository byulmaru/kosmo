import { AccountProfileRole } from '@kosmo/core/enums';
import { pinProfilePost, unpinProfilePost } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile } from '../ref';

builder.mutationField('pinProfilePost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('PinProfilePostPayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        changed: field.boolean(),
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

      return { changed: result.changed, profile: ctx.session.profile.id };
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
      postId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await unpinProfilePost({
        profileId: ctx.session.profile.id,
        postId: input.postId.id,
      });

      return { changed: result.changed, profile: ctx.session.profile.id };
    },
  }),
);
