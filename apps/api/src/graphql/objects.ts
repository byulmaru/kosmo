import { db, decodeDbId } from '@kosmo/shared/db';
import * as T from '@kosmo/shared/db/tables';
import { asc, inArray } from 'drizzle-orm';
import { builder } from './builder';
import type { MaybePromise } from '@pothos/core';
import type { DataLoaderOptions } from '@pothos/plugin-dataloader';
import type { AnyPgColumn, AnyPgTable, PgTable, TableConfig } from 'drizzle-orm/pg-core';
import type { Builder } from './builder';

type IdColumn = AnyPgColumn<{ data: string; notNull: true }>;
type TableWithIdColumn<T extends TableConfig> = AnyPgTable<{ columns: { id: IdColumn } }> & {
  id: IdColumn;
} & PgTable<T>;

type SchemaTypes = Builder extends PothosSchemaTypes.SchemaBuilder<infer T> ? T : never;

const makeLoadableFields = <T extends TableConfig>(
  table: TableWithIdColumn<T>,
): DataLoaderOptions<
  SchemaTypes,
  typeof table.$inferSelect,
  string,
  string,
  typeof table.$inferSelect
> => ({
  load: (ids) => db.select().from(table).where(inArray(table.id, ids)).orderBy(asc(table.id)),
  toKey: (parent) => parent.id,
  sort: true,
  cacheResolved: true,
  loaderOptions: {
    cache: false,
  },
});

const createObjectRef = <T extends TableConfig>(name: string, table: TableWithIdColumn<T>) => {
  return builder.loadableObjectRef(name, {
    ...makeLoadableFields(table),
  });
};

const createInterfaceRef = <T extends TableConfig>(name: string, table: TableWithIdColumn<T>) => {
  return builder.loadableInterfaceRef(name, {
    ...makeLoadableFields(table),
  });
};

export const isTypeOf = (tableCode: string) => (self: unknown) => {
  return decodeDbId((self as { id: string }).id) === tableCode;
};

export const IProfile = createInterfaceRef('IProfile', T.Profiles);

export const Account = createObjectRef('Account', T.Accounts);
export const ManagedProfile = createObjectRef('ManagedProfile', T.Profiles);
export const PublicProfile = createObjectRef('PublicProfile', T.Profiles);

interface Count {
  currentLoader: () => MaybePromise<number>;
  maxLoader: () => MaybePromise<number | null>;
}

export const Count = builder.objectRef<Count>('Count');
