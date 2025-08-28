import { db, Posts, ProfileFollows } from '@kosmo/db';
import { PostState, PostVisibility } from '@kosmo/enum';
import { and, eq, getTableColumns, inArray, or, sql } from 'drizzle-orm';
import type { Context } from '@/context';

export const getPostLoader = (ctx: Context) =>
  ctx.loader({
    name: 'post',
    nullable: true,
    load: async (ids) => {
      return await db
        .select(getTableColumns(Posts))
        .from(Posts)
        .leftJoin(
          ProfileFollows,
          and(
            ctx.session?.profileId
              ? eq(ProfileFollows.profileId, ctx.session.profileId)
              : sql`false`,
            inArray(ProfileFollows.targetProfileId, Posts.profileId),
          ),
        )
        .where(
          and(
            inArray(Posts.id, ids),
            eq(Posts.state, PostState.ACTIVE),
            or(
              ctx.session?.profileId ? eq(Posts.profileId, ctx.session.profileId) : undefined,
              inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]),
              and(
                inArray(Posts.profileId, ProfileFollows.targetProfileId),
                eq(Posts.visibility, PostVisibility.FOLLOWER),
              ),
            ),
          ),
        );
    },

    key: (post) => post?.id,
  });
