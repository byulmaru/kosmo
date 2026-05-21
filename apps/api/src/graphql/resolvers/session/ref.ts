import { db, Sessions, TableDiscriminator } from '@kosmo/core/db';
import { inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const Session = createObjectRef('Session', Sessions, TableDiscriminator.Sessions, (ids) =>
  db.select().from(Sessions).where(inArray(Sessions.id, ids)),
);

Session.implement({
  authScopes: (session, ctx) => session.id === ctx.session?.id,
  fields: () => ({}),
});
