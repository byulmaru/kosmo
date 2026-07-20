import { PostVisibility } from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { postBodyTextSchema } from '@kosmo/core/validation';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.mutationField('createPost', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('CreatePostPayload', {
      fields: (field) => ({
        post: field.field({ type: Post }),
      }),
    }),
    input: {
      bodyText: t.input.string({ validate: postBodyTextSchema }),
      visibility: t.input.field({ type: PostVisibility }),
    },
    resolve: async (_, { input }, ctx) => {
      const { post } = await createPost({
        document: postContentDocumentFromText(input.bodyText),
        origin: 'LOCAL',
        profileId: ctx.session.profileId,
        visibility: input.visibility,
      });

      return { post };
    },
  }),
);
