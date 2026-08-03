import { db, Instances, Posts, ProfileFollows, Profiles } from '@kosmo/core/db';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, exists, getColumns, gt, isNull, lt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import { postAccessWhere } from '../access';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

const ReplyParents = alias(Posts, 'home_timeline_reply_parent');

builder.queryField('homeTimeline', (t) =>
  t.withAuth({ usingProfile: true }).connection(
    {
      type: Post,
      nullable: true,
      unauthorizedResolver: () => null,
      resolve: (_, args, ctx) => {
        const followeeWhere = exists(
          db
            .select({ id: ProfileFollows.id })
            .from(ProfileFollows)
            .where(
              and(
                eq(ProfileFollows.followerProfileId, ctx.session.profileId),
                eq(ProfileFollows.followeeProfileId, Posts.profileId),
              ),
            ),
        );
        const replyParentIsViewerPost = exists(
          db
            .select({ id: ReplyParents.id })
            .from(ReplyParents)
            .where(
              and(
                eq(ReplyParents.id, Posts.replyParentId),
                eq(ReplyParents.profileId, ctx.session.profileId),
              ),
            ),
        );
        const replyParentAuthorIsFollowee = exists(
          db
            .select({ id: ReplyParents.id })
            .from(ReplyParents)
            .innerJoin(ProfileFollows, eq(ProfileFollows.followeeProfileId, ReplyParents.profileId))
            .where(
              and(
                eq(ReplyParents.id, Posts.replyParentId),
                eq(ProfileFollows.followerProfileId, ctx.session.profileId),
              ),
            ),
        );
        const homeCandidateWhere = or(
          eq(Posts.profileId, ctx.session.profileId),
          and(isNull(Posts.replyParentId), followeeWhere),
          replyParentIsViewerPost,
          and(followeeWhere, replyParentAuthorIsFollowee),
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
