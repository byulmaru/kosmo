import { db, PostContents, Posts } from '@kosmo/core/db';
import { PostState } from '@kosmo/core/enums';
import { and, eq, getColumns, inArray, isNotNull } from 'drizzle-orm';
import { markCachedHomeTimelinePost } from '../ref';
import type { UserContext } from '@/context';

export const cachedHomePostContentLoader = (ctx: UserContext) =>
  ctx.loader<string, typeof PostContents.$inferSelect, string, true>({
    name: 'post.cachedHomeContent',
    nullable: true,
    load: (contentIds) =>
      db
        .select(getColumns(PostContents))
        .from(PostContents)
        .innerJoin(
          Posts,
          and(eq(Posts.currentContentId, PostContents.id), eq(Posts.id, PostContents.postId)),
        )
        .where(and(inArray(PostContents.id, contentIds), eq(Posts.state, PostState.ACTIVE))),
    key: (content) => content?.id ?? null,
  });

export const cachedHomeRepostSourceLoader = (ctx: UserContext) =>
  ctx.loader<string, typeof Posts.$inferSelect, string, true>({
    name: 'post.cachedHomeRepostSource',
    nullable: true,
    load: async (postIds) => {
      const posts = await db
        .select(getColumns(Posts))
        .from(Posts)
        .where(
          and(
            inArray(Posts.id, postIds),
            eq(Posts.state, PostState.ACTIVE),
            isNotNull(Posts.currentContentId),
          ),
        );

      for (const post of posts) {
        markCachedHomeTimelinePost(post);
      }

      return posts;
    },
    key: (post) => post?.id ?? null,
  });
