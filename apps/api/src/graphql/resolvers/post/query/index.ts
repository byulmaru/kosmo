import { db, first, Posts } from '@kosmo/db';
import { PostState } from '@kosmo/enum';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/objects';

builder.queryField('post', (t) =>
  t.field({
    type: Post,
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_, { id }) => {
      const post = await db
        .select()
        .from(Posts)
        .where(and(eq(Posts.id, id), eq(Posts.state, PostState.ACTIVE)))
        .then(first);

      return post;
    },
  }),
);
