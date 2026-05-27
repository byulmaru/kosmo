import { db, Sessions, TableDiscriminator } from '@kosmo/core/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const Session = createObjectRef('Session', TableDiscriminator.Sessions, (ids, ctx) =>
  db
    .select()
    .from(Sessions)
    .where(
      and(inArray(Sessions.id, ids), ctx.session ? eq(Sessions.id, ctx.session.id) : sql`1=0`),
    ),
);

Session.implement({
  authScopes: (session, ctx) => session.id === ctx.session?.id,
  fields: () => ({}),
});
