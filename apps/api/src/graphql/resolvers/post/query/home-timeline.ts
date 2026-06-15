import { db, Posts, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileFollowState } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, exists, getColumns, gt, lt, or } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { postVisibilityAccessWhere } from '../access/visibility';
import { Post } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.queryField('homeTimeline', (t) =>
  t.withAuth({ usingProfile: true }).connection(
    {
      type: Post,
      resolve: (_, args, ctx) => {
        const acceptedFolloweeWhere = exists(
          db
            .select({ id: ProfileFollows.id })
            .from(ProfileFollows)
            .where(
              and(
                eq(ProfileFollows.followerProfileId, ctx.session.profileId),
                eq(ProfileFollows.followeeProfileId, Posts.profileId),
                eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
              ),
            ),
        );

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
                  or(eq(Posts.profileId, ctx.session.profileId), acceptedFolloweeWhere),
                  postVisibilityAccessWhere({ authorProfile: Profiles, ctx }),
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
      name: 'HomeTimelineConnection',
    },
  ),
);
