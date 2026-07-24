import { db, Reactions } from '@kosmo/core/db';
import { count, desc, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

export type ReactionCountRow = {
  postId: string;
  type: string;
  count: number;
};

export const reactionCountLoader = (ctx: UserContext) =>
  ctx.loader<string, ReactionCountRow, string, false, true>({
    name: 'post.reactionCounts',
    many: true,
    load: async (postIds) => {
      const reactionCount = count();

      return db
        .select({
          postId: Reactions.postId,
          type: Reactions.type,
          count: reactionCount,
        })
        .from(Reactions)
        .where(inArray(Reactions.postId, postIds))
        .groupBy(Reactions.postId, Reactions.type)
        .orderBy(desc(reactionCount));
    },
    key: (row) => row.postId,
  });
