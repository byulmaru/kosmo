import { db, Posts, Profiles } from '@kosmo/core/db';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { configuredLocalProfileWhere } from '@/profile/identity';
import { postVisibilityAccessWhere } from '../access/visibility';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.objectFields(Profile, (t) => ({
  posts: t.connection(
    {
      type: Post,
      resolve: async (profile, args, ctx) => {
        const localInstance = await resolveConfiguredLocalInstance();

        return resolveCursorConnection<Promise<PostRow[]>>(
          {
            args,
            toCursor: (post) => post.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(Posts))
              .from(Posts)
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .where(
                and(
                  eq(Posts.profileId, profile.id),
                  configuredLocalProfileWhere(Profiles, localInstance.id),
                  postVisibilityAccessWhere({ ctx }),
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
