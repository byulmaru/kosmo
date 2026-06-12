import { db, Posts } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { postVisibilityAccessWhere } from '../access/visibility';
import { Post } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.objectFields(Profile, (t) => ({
  posts: t.connection(
    {
      type: Post,
      resolve: (profile, args, ctx) => {
        return resolveCursorConnection<Promise<PostRow[]>>(
          {
            args,
            toCursor: (post) => post.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select()
              .from(Posts)
              .where(
                and(
                  eq(Posts.profileId, profile.id),
                  eq(Posts.state, PostState.ACTIVE),
                  postVisibilityAccessWhere({
                    ctx,
                    publicVisibilities: [PostVisibility.PUBLIC],
                  }),
                  before ? gt(Posts.id, before) : undefined,
                  after ? lt(Posts.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
              .limit(limit),
        );
      },
    },
    {
      name: 'PostsConnection',
    },
  ),
}));
