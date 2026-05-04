import { drizzle } from 'drizzle-orm/bun-sql';
import * as schema from './tables';
import type { PgDatabase, PgTransaction } from 'drizzle-orm/pg-core';

const databaseUrl = Bun.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export * from './id';
export * from './tables';
export * from './utils';

export const db = drizzle(databaseUrl, { schema });

export type Database = typeof db;
export type Transaction =
  Database extends PgDatabase<infer T, infer U, infer V> ? PgTransaction<T, U, V> : never;
