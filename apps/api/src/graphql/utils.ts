import { db } from '@kosmo/core/db';
import { asc, inArray } from 'drizzle-orm';
import { builder } from './builder';
import type { TableDiscriminator } from '@kosmo/core/db';
import type { TableConfig } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable, PgColumns, PgTable } from 'drizzle-orm/pg-core';

type IdColumn = AnyPgColumn<{ data: string; notNull: true }>;
type TableWithIdColumn<T extends TableConfig<PgColumns>> = AnyPgTable<{
  columns: { id: IdColumn };
}> & {
  id: IdColumn;
} & PgTable<T>;

export const globalIdMap = new Map<number, string>();

export const createObjectRef = <T extends TableConfig<PgColumns>>(
  name: string,
  table: TableWithIdColumn<T>,
  discirminator: (typeof TableDiscriminator)[keyof typeof TableDiscriminator],
) => {
  globalIdMap.set(discirminator, name);

  return builder.loadableNodeRef(name, {
    load: (ids) => db.select().from(table).where(inArray(table.id, ids)).orderBy(asc(table.id)),
    toKey: (obj) => obj.id,
    sort: true,
    cacheResolved: true,
    id: { resolve: (obj) => obj.id },
  });
};
