import { AccountProfileRole } from '@kosmo/core/enums';
import { deletePost } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.mutationField('deletePost', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
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
      const result = await deletePost({
        actorProfileId: ctx.session.profile.id,
        origin: 'LOCAL',
        postId: input.id.id,
      });

      return {
        postId: result.postId,
        repostSource: result.sourcePostId,
      };
    },
  }),
);
