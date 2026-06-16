import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as enums from './enums';
import { relations } from './relations';
import * as tables from './tables';

export * from './id';
export * from './relations';
export * from './tables';
export * from './utils';

export const pg = postgres(process.env.DATABASE_URL!, {
  max: 20,
  max_lifetime: 3600,
  connection: {
    idle_in_transaction_session_timeout: 30 * 1000,
    lock_timeout: 10 * 1000,
    statement_timeout: 30 * 1000,
  },
});

export const db = drizzle({
  client: pg,
  relations,
  schema: { ...tables, ...enums },
});

export type Database = typeof db;
