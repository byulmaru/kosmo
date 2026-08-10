import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as enums from './enums';
import * as tables from './tables';

export * from './tables';
export * from './utils';

const schema = { ...tables, ...enums };

export const postgresSessionTimeouts = {
  idle_in_transaction_session_timeout: 30 * 1000,
  lock_timeout: 10 * 1000,
  statement_timeout: 30 * 1000,
} as const;

const postgresConnectionOptions = {
  max_lifetime: 3600,
  connection: postgresSessionTimeouts,
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
  close: (options?: { force?: boolean }) => Promise<void>;
};

const stripOperationSessionTimeouts = (databaseUrl: string) => {
  const url = new URL(databaseUrl);

  for (const setting of Object.keys(postgresSessionTimeouts)) {
    url.searchParams.delete(setting);
  }

  return url.toString();
};

/**
 * Create the database handle owned by one GraphQL Query or Mutation.
 *
 * The client is deliberately not leased from the process-wide pool. A single
 * postgres.js connection is created for the operation and closed afterwards so
 * PgBouncer can apply its client-disconnect reset boundary.
 */
export const createOperationDatabase = (
  // Helm supplies OPERATION_DATABASE_URL for the API's GraphQL operation
  // client. Local and test processes intentionally fall back to the direct
  // process-wide DATABASE_URL when that opt-in endpoint is absent.
  databaseUrl = process.env.OPERATION_DATABASE_URL || process.env.DATABASE_URL!,
): OperationDatabaseOwner => {
  const client = postgres(stripOperationSessionTimeouts(databaseUrl), {
    // PgBouncer does not accept the operation timeout settings as startup
    // parameters. The operation plugin applies them at session scope after
    // the client connects, together with the actor settings.
    max_lifetime: postgresConnectionOptions.max_lifetime,
    connect_timeout: 5,
    max: 1,
  });
  const operationDb = drizzle({ client, schema });
  let closeTask: Promise<void> | undefined;

  return {
    db: operationDb,
    close: (options) => (closeTask ??= options?.force ? client.end({ timeout: 0 }) : client.end()),
  };
};

export const getDatabaseConnection = (handle?: DatabaseHandle) => {
  return handle ?? db;
};
