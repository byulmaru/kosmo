import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as enums from './enums';
import * as tables from './tables';

export * from './tables';
export * from './utils';

const schema = { ...tables, ...enums };

export const pg = postgres({
  max_lifetime: 3600,
  max: 20,
  prepare: false,
});

export const db = drizzle({
  client: pg,
  schema,
});

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DatabaseHandle = Database | Transaction;

export const getDatabaseConnection = (handle?: DatabaseHandle) => {
  return handle ?? db;
};
