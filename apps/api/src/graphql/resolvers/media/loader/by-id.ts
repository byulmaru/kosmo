import { db, Media } from '@kosmo/core/db';
import { getColumns, inArray } from 'drizzle-orm';
import type { UserContext } from '@/context';

type MediaRow = typeof Media.$inferSelect;

export const mediaByIdLoader = (ctx: UserContext) =>
  ctx.loader<string, MediaRow, string, true>({
    name: 'media.byId',
    nullable: true,
    load: (ids) => db.select(getColumns(Media)).from(Media).where(inArray(Media.id, ids)),
    key: (media) => media?.id ?? null,
  });
