import { db, Instances, Posts, Profiles, Reactions } from '@kosmo/core/db';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { postAccessWhere } from '../access';
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
        .innerJoin(Posts, eq(Posts.id, Reactions.postId))
        .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(and(inArray(Reactions.postId, postIds), postAccessWhere({ ctx })))
        .groupBy(Reactions.postId, Reactions.type)
        .orderBy(desc(reactionCount));
    },
    key: (row) => row.postId,
  });
