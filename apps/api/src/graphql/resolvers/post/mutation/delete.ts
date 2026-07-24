import { deletePost } from '@kosmo/core/services';
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
    resolve: (_, { input }, ctx) =>
      deletePost({
        actorProfileId: ctx.session.profileId,
        postId: input.id.id,
      }),
  }),
);
