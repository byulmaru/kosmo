import { Hashtags } from '@kosmo/core/db';
import { inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const Hashtag = createObjectRef('Hashtag', (ids, ctx) =>
  ctx.db.select().from(Hashtags).where(inArray(Hashtags.id, ids)),
);

Hashtag.implement({
  fields: (t) => ({
    name: t.exposeString('displayName'),
  }),
});
