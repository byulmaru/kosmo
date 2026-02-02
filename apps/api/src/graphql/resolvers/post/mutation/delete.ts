import { db, firstOrThrow, firstOrThrowWith, Posts } from '@kosmo/db';
import { PostState } from '@kosmo/enum';
import { and, eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { NotFoundError } from '@/error';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/objects';

builder.mutationField('deletePost', (t) =>
  t.withAuth({ scope: 'post:write', profile: true }).fieldWithInput({
    type: Post,
    input: {
      postId: t.input.string(),
    },

    errors: {
      types: [NotFoundError],
      dataField: { name: 'post' },
    },

    resolve: async (_, { input }, ctx) => {
      const post = await db
        .select({ id: Posts.id })
        .from(Posts)
        .where(
          and(
            eq(Posts.id, input.postId),
            eq(Posts.state, PostState.ACTIVE),
            eq(Posts.profileId, ctx.session.profileId),
          ),
        )
        .then(firstOrThrowWith(() => new NotFoundError({ code: 'error.post.notFound' })));

      const deletedPost = await db
        .update(Posts)
        .set({
          state: PostState.DELETED,
          deletedAt: Temporal.Now.instant(),
        })
        .where(eq(Posts.id, post.id))
        .returning()
        .then(firstOrThrow);

      return deletedPost;
    },
  }),
);
