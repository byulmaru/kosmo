import { PostVisibility } from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { createLocalPost } from '@kosmo/core/services';
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
      replyParentId: t.input.globalID({ for: Post, required: false }),
      visibility: t.input.field({ type: PostVisibility }),
    },
    resolve: async (_, { input }, ctx) => {
      const { post } = await createLocalPost({
        document: postContentDocumentFromText(input.bodyText),
        profileId: ctx.session.profileId,
        replyParentId: input.replyParentId?.id,
        visibility: input.visibility,
      });

      return { post };
    },
  }),
);
