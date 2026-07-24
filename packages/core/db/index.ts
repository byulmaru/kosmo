import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as enums from './enums';
import { getPostgresSsl } from './ssl';
import * as tables from './tables';

export * from './tables';
export * from './utils';

export const pg = postgres(process.env.DATABASE_URL!, {
  ssl: getPostgresSsl(),
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
  schema: { ...tables, ...enums },
});

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export const getDatabaseConnection = (tx?: Transaction) => {
  return tx ?? db;
};
