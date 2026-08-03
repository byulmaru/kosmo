import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { postAccessWhere } from '../access';
import { homePostListCandidateWhere } from '../list-policy';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.queryField('homeTimeline', (t) =>
  t.withAuth({ usingProfile: true }).connection(
    {
      type: Post,
      nullable: true,
      unauthorizedResolver: () => null,
      resolve: (_, args, ctx) => {
        const homeCandidateWhere = homePostListCandidateWhere(ctx.session.profileId);

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
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  homeCandidateWhere,
                  postAccessWhere({ ctx }),
                  before ? gt(Posts.id, before) : undefined,
                  after ? lt(Posts.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
              .limit(limit),
        );
      },
    },
    PostConnection as never,
  ),
);
