import { db, firstOrThrow, Posts } from '@kosmo/db';
import { PostVisibility } from '@kosmo/enum';
import * as validationSchema from '@kosmo/validation';
import { ForbiddenError, ValidationError } from '@/error';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/objects';

builder.mutationField('createPost', (t) =>
  t.withAuth({ scope: 'post:write', profile: true }).fieldWithInput({
    type: Post,
    input: {
      content: t.input.string({ validate: validationSchema.postContent }),
      visibility: t.input.field({ type: PostVisibility, required: false }),
      replyToPostId: t.input.string({ required: false }),
    },

    errors: {
      types: [ValidationError, ForbiddenError],
      dataField: { name: 'post' },
    },

    resolve: async (_, { input }, ctx) => {
      const post = await db
        .insert(Posts)
        .values({
          profileId: ctx.session.profileId,
          content: input.content,
          visibility: input.visibility ?? PostVisibility.PUBLIC,
          replyToPostId: input.replyToPostId,
        })
        .returning()
        .then(firstOrThrow);

      return post;
    },
  }),
);
