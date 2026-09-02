import { and, desc, eq, isNull } from 'drizzle-orm';
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

const processDatabaseOptions = {
  ...postgresConnectionOptions,
  max: 20,
} as const;

export const pg = postgres(processDatabaseOptions);

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

export const findProfileMute = async (ownerProfileId: string, targetProfileId: string) => {
  const [profileMute] = await db
    .select()
    .from(tables.ProfileMutes)
    .where(
      and(
        eq(tables.ProfileMutes.ownerProfileId, ownerProfileId),
        eq(tables.ProfileMutes.targetProfileId, targetProfileId),
        isNull(tables.ProfileMutes.expiresAt),
      ),
    )
    .limit(1);

  return profileMute ?? null;
};

export const findProfileMutesByOwner = async (ownerProfileId: string) =>
  db
    .select()
    .from(tables.ProfileMutes)
    .where(
      and(
        eq(tables.ProfileMutes.ownerProfileId, ownerProfileId),
        isNull(tables.ProfileMutes.expiresAt),
      ),
    )
    .orderBy(desc(tables.ProfileMutes.id));

export const isProfileMuted = async (ownerProfileId: string, targetProfileId: string) =>
  (await findProfileMute(ownerProfileId, targetProfileId)) !== null;
