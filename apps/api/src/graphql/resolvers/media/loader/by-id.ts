import { Media as MediaTable } from '@kosmo/core/db';
import { getColumns, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type MediaRow = typeof MediaTable.$inferSelect;

export const mediaByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, MediaRow, string, true>({
    name: 'media.byId',
    nullable: true,
    load: (ids) =>
      ctx.db.select(getColumns(MediaTable)).from(MediaTable).where(inArray(MediaTable.id, ids)),
    key: (media) => media?.id ?? null,
  });
