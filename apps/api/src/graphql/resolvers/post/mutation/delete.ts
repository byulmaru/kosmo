import { deletePost } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

type DeletePostPayload = {
  readonly postId: string;
  readonly repostSource: string | null;
};

builder.mutationField('deletePost', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('DeletePostPayload', {
      fields: (field) => ({
        postId: field.globalID({
          resolve: (payload) => ({
            id: (payload as { postId: string }).postId,
            type: Post,
          }),
        }),
        repostSource: field.field({
          nullable: true,
          type: Post,
        }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await deletePost(
        {
          actorProfileId: ctx.session.profileId,
          origin: 'LOCAL',
          postId: input.id.id,
        },
        ctx.db,
      );
      await result.postCommit(ctx.db);

      return {
        postId: result.postId,
        repostSource: result.sourcePostId,
      } satisfies DeletePostPayload;
    },
  }),
);
