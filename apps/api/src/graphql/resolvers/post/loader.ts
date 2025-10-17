import { db, PostMentions, Posts, PostSnapshots, ProfileFollows } from '@kosmo/db';
import { PostSnapshotState, PostState, PostVisibility } from '@kosmo/enum';
import { and, eq, getTableColumns, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { Context } from '@/context';

export const getPostLoader = (ctx: Context) =>
  ctx.loader({
    name: 'Post',
    nullable: true,
    load: async (ids) => {
      const profileId = ctx.session?.profileId;

      return await db
        .select(getTableColumns(Posts))
        .from(Posts)
        .leftJoin(
          ProfileFollows,
          and(
            eq(ProfileFollows.targetProfileId, Posts.profileId),
            profileId ? eq(ProfileFollows.profileId, profileId) : sql`FALSE`,
          ),
        )
        .leftJoin(
          PostMentions,
          and(
            eq(PostMentions.postId, Posts.id),
            profileId ? eq(PostMentions.profileId, profileId) : sql`FALSE`,
          ),
        )
        .where(
          and(
            inArray(Posts.id, ids),
            eq(Posts.state, PostState.ACTIVE),
            or(
              profileId ? eq(Posts.profileId, profileId) : undefined,
              isNotNull(PostMentions.id),
              inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]),
              and(eq(Posts.visibility, PostVisibility.FOLLOWER), isNotNull(ProfileFollows.id)),
            ),
          ),
        );
    },
    key: (post) => post?.id,
  });

export const getPostSnapshotLoader = (ctx: Context) =>
  ctx.loader({
    name: 'PostSnapshot(postId)',
    nullable: true,
    load: async (ids) => {
      return await db
        .select()
        .from(PostSnapshots)
        .where(
          and(
            inArray(PostSnapshots.postId, ids),
            eq(PostSnapshots.state, PostSnapshotState.ACTIVE),
          ),
        );
    },
    key: (postSnapshot) => postSnapshot?.postId,
  });
