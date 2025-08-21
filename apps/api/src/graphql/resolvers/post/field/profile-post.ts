import { db, Posts } from '@kosmo/db';
import { PostState, PostVisibility } from '@kosmo/enum';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getTableColumns, gt, inArray, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { followingLoader } from '@/loader/following';
import { PostConnection } from '../connection';
import type { ResolveCursorConnectionArgs } from '@pothos/plugin-relay';

builder.objectField(Profile, 'posts', (t) =>
  t.field({
    type: PostConnection,
    nullable: true,
    args: {
      ...t.arg.connectionArgs(),
    },
    resolve: (profile, args, ctx) =>
      resolveCursorConnection(
        { args, toCursor: (post) => post.id },
        async ({ before, after, limit, inverted }: ResolveCursorConnectionArgs) => {
          const isMyProfile = ctx.session?.profileId === profile.id;
          const isFollowing = isMyProfile
            ? true
            : await followingLoader(ctx)
                .load(profile.id)
                .then((follow) => !!follow);

          return await db
            .select(getTableColumns(Posts))
            .from(Posts)
            .where(
              and(
                eq(Posts.profileId, profile.id),
                eq(Posts.state, PostState.ACTIVE),
                before ? lt(Posts.id, before) : undefined,
                after ? gt(Posts.id, after) : undefined,
                isMyProfile
                  ? undefined
                  : inArray(Posts.visibility, [
                      PostVisibility.PUBLIC,
                      PostVisibility.UNLISTED,
                      ...(isFollowing ? [PostVisibility.FOLLOWER] : []),
                    ]),
              ),
            )
            .orderBy(inverted ? asc(Posts.createdAt) : desc(Posts.createdAt))
            .limit(limit);
        },
      ),
  }),
);
