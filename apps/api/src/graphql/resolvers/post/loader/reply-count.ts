import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { PostState } from '@kosmo/core/enums';
import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { directPostVisibilityAccessWhere } from '../access/visibility';
import type { UserContext } from '@/context';

type ReplyCountRow = {
  replyParentId: string | null;
  count: number;
};

export const replyCountLoader = (ctx: UserContext) =>
  ctx.loader<string, ReplyCountRow, string, true>({
    name: 'post.replyCount',
    nullable: true,
    load: async (parentIds) =>
      db
        .select({
          replyParentId: Posts.replyParentId,
          count: count(),
        })
        .from(Posts)
        .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(Posts.replyParentId, parentIds),
            isNotNull(Posts.currentContentId),
            eq(Posts.state, PostState.ACTIVE),
            directPostVisibilityAccessWhere({ ctx }),
          ),
        )
        .groupBy(Posts.replyParentId),
    key: (row) => row?.replyParentId ?? null,
  });
