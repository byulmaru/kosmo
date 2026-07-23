import { repostPost } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.mutationField('repostPost', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('RepostPostPayload', {
      fields: (field) => ({
        repost: field.field({ type: Post }),
      }),
    }),
    input: {
      sourceId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => ({
      repost: await repostPost({
        actorProfileId: ctx.session.profileId,
        sourcePostId: input.sourceId.id,
      }),
    }),
  }),
);
