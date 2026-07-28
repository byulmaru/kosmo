import { deletePost } from '@kosmo/core/services';
import { sendLocalReplyDelete } from '@kosmo/fedify';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

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
      }),
    }),
    input: {
      id: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) => {
      const result = await deletePost({
        actorProfileId: ctx.session.profileId,
        postId: input.id.id,
      });

      await sendLocalReplyDelete(result.postId).catch((error) => {
        console.error('Post-commit ActivityPub Reply Delete delivery failed', {
          error,
          postId: result.postId,
        });
      });
      return result;
    },
  }),
);
