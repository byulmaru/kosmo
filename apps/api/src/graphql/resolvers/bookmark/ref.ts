import { Bookmarks, db } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';

export const Bookmark = createObjectRef('Bookmark', (ids, ctx) => {
  if (!ctx.session?.profileId) {
    return Promise.resolve([]);
  }

  return db
    .select(getColumns(Bookmarks))
    .from(Bookmarks)
    .where(and(inArray(Bookmarks.id, ids), eq(Bookmarks.profileId, ctx.session.profileId)));
});

Bookmark.implement({
  fields: (t) => ({
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
