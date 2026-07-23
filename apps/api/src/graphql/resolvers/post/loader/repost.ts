import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { PostState } from '@kosmo/core/enums';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { visibleProfileWhere } from '@/profile/visibility';
import type { UserContext } from '@/context';

type RepostCountRow = {
  repostSourceId: string | null;
  count: number;
};

export const repostCountLoader = (ctx: UserContext) =>
  ctx.loader<string, RepostCountRow, string, true>({
    name: 'post.repostCount',
    nullable: true,
    load: async (sourceIds) =>
      db
        .select({
          repostSourceId: Posts.repostSourceId,
          count: count(),
        })
        .from(Posts)
        .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            inArray(Posts.repostSourceId, sourceIds),
            eq(Posts.state, PostState.ACTIVE),
            isNull(Posts.currentContentId),
            isNull(Posts.replyParentId),
            visibleProfileWhere({ profile: Profiles, instance: Instances }),
          ),
        )
        .groupBy(Posts.repostSourceId),
    key: (row) => row?.repostSourceId ?? null,
  });
