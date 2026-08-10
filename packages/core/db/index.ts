import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as enums from './enums';
import * as tables from './tables';

export * from './tables';
export * from './utils';

const schema = { ...tables, ...enums };

const postgresConnectionOptions = {
  max_lifetime: 3600,
  connection: {
    idle_in_transaction_session_timeout: 30 * 1000,
    lock_timeout: 10 * 1000,
    statement_timeout: 30 * 1000,
  },
} as const;

export const pg = postgres(process.env.DATABASE_URL!, {
  ...postgresConnectionOptions,
  max: 20,
});

export const db = drizzle({
  client: pg,
  schema,
});

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DatabaseHandle = Database | Transaction;

export type OperationDatabaseOwner = {
  db: Database;
  close: () => Promise<void>;
};

/**
 * Create the database handle owned by one GraphQL Query or Mutation.
 *
 * The client is deliberately not leased from the process-wide pool. A single
 * postgres.js connection is created for the operation and closed afterwards so
 * PgBouncer can apply its client-disconnect reset boundary.
 */
export const createOperationDatabase = (
  databaseUrl = process.env.DATABASE_URL!,
): OperationDatabaseOwner => {
  const client = postgres(databaseUrl, {
    ...postgresConnectionOptions,
    connect_timeout: 5,
    max: 1,
  });
  const operationDb = drizzle({ client, schema });
  let closePromise: Promise<void> | undefined;

  return {
    db: operationDb,
    close: () => {
      closePromise ??= client.end();
      return closePromise;
    },
  };
};

export const getDatabaseConnection = (handle?: DatabaseHandle) => {
  return handle ?? db;
};
