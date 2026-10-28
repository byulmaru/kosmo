import { AsyncLocalStorage } from 'node:async_hooks';
import { withReplicas } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as enums from './enums';
import * as tables from './tables';

export * from './tables';
export * from './utils';

const schema = { ...tables, ...enums };

const postgresOptions = {
  max_lifetime: 3600,
  max: 20,
  prepare: false,
};

export const pg = postgres(postgresOptions);
export const pgRead = process.env.PGREADHOST
  ? postgres({ ...postgresOptions, host: process.env.PGREADHOST })
  : undefined;

const primaryDb = drizzle({
  client: pg,
  schema,
});

const replicaDb = pgRead ? drizzle({ client: pgRead, schema }) : primaryDb;
const usePrimaryDatabase = new AsyncLocalStorage<true>();

export const db = withReplicas(primaryDb, [replicaDb], () =>
  usePrimaryDatabase.getStore() ? primaryDb : replicaDb,
);

export const withPrimaryDatabase = <T>(callback: () => T): T =>
  usePrimaryDatabase.run(true, callback);

export type Database = typeof primaryDb;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DatabaseHandle = Database | Transaction;

export const getDatabaseConnection = (handle?: DatabaseHandle) => {
  return handle ?? db;
};
