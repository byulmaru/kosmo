import { db, firstOrThrow, PostContents, Posts } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { postBodyTextSchema } from '@kosmo/core/validation';
import { eq } from 'drizzle-orm';
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
      const body = postContentDocumentFromText(input.bodyText);
      const post = await db.transaction(async (tx) => {
        const post = await tx
          .insert(Posts)
          .values({
            profileId: ctx.session.profileId,
            visibility: input.visibility,
            state: PostState.ACTIVE,
          })
          .returning()
          .then(firstOrThrow);

        const content = await tx
          .insert(PostContents)
          .values({
            postId: post.id,
            document: body,
          })
          .returning()
          .then(firstOrThrow);

        return await tx
          .update(Posts)
          .set({ currentContentId: content.id })
          .where(eq(Posts.id, post.id))
          .returning()
          .then(firstOrThrow);
      });

      return { post };
    },
  }),
);
