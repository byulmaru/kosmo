import { drizzle } from 'drizzle-orm/postgres-js';
import * as enums from './enums';
import { relations } from './relations';
import * as tables from './tables';
import type { PgDatabase, PgTransaction } from 'drizzle-orm/pg-core';

export * from './id';
export * from './relations';
export * from './tables';
export * from './utils';

export const db = drizzle(process.env.DATABASE_URL!, {
  relations,
  schema: { ...tables, ...enums },
});

export type Database = typeof db;
export type Transaction =
  Database extends PgDatabase<infer T, infer U, infer V> ? PgTransaction<T, U, V> : never;
