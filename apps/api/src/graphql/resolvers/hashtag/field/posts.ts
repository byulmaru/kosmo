import { db, Instances, PostContentHashtags, PostContents, Posts, Profiles } from '@kosmo/core/db';
import { PostVisibility } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, isNull, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { postAccessWhere } from '@/graphql/resolvers/post/access';
import { Post, PostConnection } from '@/graphql/resolvers/post/ref';
import { Hashtag } from '../ref';

type PostRow = typeof Posts.$inferSelect;

builder.objectField(Hashtag, 'posts', (t) =>
  t.connection(
    {
      type: Post,
      resolve: (hashtag, args, ctx) =>
        resolveCursorConnection<Promise<PostRow[]>>(
          {
            args,
            toCursor: (post) => post.id,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(Posts))
              .from(PostContentHashtags)
              .innerJoin(PostContents, eq(PostContents.id, PostContentHashtags.postContentId))
              .innerJoin(Posts, eq(Posts.id, PostContents.postId))
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(PostContentHashtags.hashtagId, hashtag.id),
                  eq(Posts.currentContentId, PostContents.id),
                  eq(Posts.visibility, PostVisibility.PUBLIC),
                  isNull(Posts.replyParentId),
                  postAccessWhere({ ctx, profileMute: 'exclude' }),
                  before ? gt(Posts.id, before) : undefined,
                  after ? lt(Posts.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
              .limit(limit),
        ),
    },
    PostConnection,
  ),
);
