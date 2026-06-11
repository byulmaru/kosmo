import { db, Posts } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { Post } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.objectFields(Profile, (t) => ({
  posts: t.connection({
    type: Post,
    resolve: (profile, args, ctx) => {
      const visibilityWhere = ctx.session?.profileId
        ? or(
            eq(Posts.visibility, PostVisibility.PUBLIC),
            eq(Posts.profileId, ctx.session.profileId),
          )
        : eq(Posts.visibility, PostVisibility.PUBLIC);

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
                visibilityWhere,
                before ? gt(Posts.id, before) : undefined,
                after ? lt(Posts.id, after) : undefined,
              ),
            )
            .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
            .limit(limit),
      );
    },
  }),
}));
