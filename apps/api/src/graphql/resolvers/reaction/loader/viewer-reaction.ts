import { db, Reactions } from '@kosmo/core/db';
import { and, asc, eq, getColumns, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type ReactionRow = typeof Reactions.$inferSelect;

export const viewerReactionLoader = (ctx: UserContext) =>
  ctx.loader<string, ReactionRow, string, false, true>({
    name: 'reaction.viewerReactions',
    many: true,
    load: async (postIds) => {
      if (!ctx.session?.profileId) {
        return [];
      }

      return db
        .select(getColumns(Reactions))
        .from(Reactions)
        .where(
          and(eq(Reactions.profileId, ctx.session.profileId), inArray(Reactions.postId, postIds)),
        )
        .orderBy(asc(Reactions.postId), asc(Reactions.id));
    },
    key: (reaction) => reaction.postId,
  });
