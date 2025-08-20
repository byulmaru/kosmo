import { db, firstOrThrow, firstOrThrowWith, Posts } from '@kosmo/db';
import { PostState } from '@kosmo/enum';
import dayjs from 'dayjs';
import { and, eq } from 'drizzle-orm';
import { NotFoundError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/objects';
import { getPermittedProfileId } from '@/utils/profile';

builder.mutationField('deletePost', (t) =>
  t.withAuth({ scope: 'post:write' }).fieldWithInput({
    type: Post,
    input: {
      postId: t.input.string(),
      actorProfileId: t.input.string({ required: false }),
    },

    errors: {
      types: [NotFoundError],
      dataField: { name: 'post' },
    },

    resolve: async (_, { input }, ctx) => {
      const actorProfileId = await getPermittedProfileId({
        ctx,
        actorProfileId: input.actorProfileId,
      });

      const post = await db
        .select({ id: Posts.id })
        .from(Posts)
        .where(
          and(
            eq(Posts.id, input.postId),
            eq(Posts.state, PostState.ACTIVE),
            eq(Posts.profileId, actorProfileId),
          ),
        )
        .then(firstOrThrowWith(() => new NotFoundError({ code: 'error.post.notFound' })));

      const deletedPost = await db
        .update(Posts)
        .set({
          state: PostState.DELETED,
          deletedAt: dayjs(),
        })
        .where(eq(Posts.id, post.id))
        .returning()
        .then(firstOrThrow);

      return deletedPost;
    },
  }),
);
