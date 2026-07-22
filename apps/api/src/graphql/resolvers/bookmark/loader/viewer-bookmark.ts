import { Bookmarks, db } from '@kosmo/core/db';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';
import type { BookmarkRow } from '../ref';

export const viewerBookmarkLoader = (ctx: UserContext) =>
  ctx.loader<string, BookmarkRow, string, true>({
    name: 'bookmark.viewerBookmark',
    nullable: true,
    load: async (postIds) => {
      if (!ctx.session?.profileId) {
        return [];
      }

      return db
        .select(getColumns(Bookmarks))
        .from(Bookmarks)
        .where(
          and(eq(Bookmarks.profileId, ctx.session.profileId), inArray(Bookmarks.postId, postIds)),
        );
    },
    key: (bookmark) => bookmark?.postId ?? null,
  });
