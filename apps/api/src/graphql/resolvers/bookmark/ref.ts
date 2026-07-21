import { Bookmarks, db } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';

export type BookmarkRow = typeof Bookmarks.$inferSelect;

export const Bookmark = createObjectRef<BookmarkRow>('Bookmark', (ids, ctx) => {
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

export const BookmarkConnection = builder.connectionObject(
  {
    type: Bookmark,
    name: 'BookmarkConnection',
  },
  {
    name: 'BookmarkConnectionEdge',
  },
);
