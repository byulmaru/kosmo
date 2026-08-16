import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, isNull, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { postAccessWhere } from '../access';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.objectFields(Profile, (t) => ({
  posts: t.connection(
    {
      type: Post,
      resolve: (profile, args, ctx) => {
        const connectionOptions = {
          args,
          toCursor: (post: PostRow) => post.id,
        };

        return resolveCursorConnection<Promise<PostRow[]>>(
          connectionOptions,
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(Posts))
              .from(Posts)
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(Posts.profileId, profile.id),
                  postAccessWhere({ ctx }),
                  isNull(Posts.replyParentId),
                  before ? gt(Posts.id, before) : undefined,
                  after ? lt(Posts.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
              .limit(limit),
        );
      },
    },
    PostConnection,
  ),
}));
