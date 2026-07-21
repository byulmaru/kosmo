import { db, Instances, Posts, Profiles, Reactions } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';
import { postVisibilityAccessWhere } from '../post/access/visibility';

export const Reaction = createObjectRef('Reaction', (ids, ctx) =>
  db
    .select(getColumns(Reactions))
    .from(Reactions)
    .innerJoin(Posts, eq(Posts.id, Reactions.postId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(and(inArray(Reactions.id, ids), postVisibilityAccessWhere({ ctx }))),
);

Reaction.implement({
  fields: (t) => ({
    type: t.exposeString('type'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
