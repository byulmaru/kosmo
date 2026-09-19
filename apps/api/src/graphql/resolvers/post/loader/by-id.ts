import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { postAccessWhere } from '../access';
import type { UserContext } from '@/context';

type PostRow = typeof Posts.$inferSelect;

export const postByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, PostRow, string, true>({
    name: 'post.byId',
    nullable: true,
    load: (ids) =>
      db
        .select(getColumns(Posts))
        .from(Posts)
        .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(and(inArray(Posts.id, ids), postAccessWhere({ ctx, profileMute: 'ignore' }))),
    key: (post) => post?.id ?? null,
  });
