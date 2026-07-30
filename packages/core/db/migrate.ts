import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { getPostgresSsl } from './ssl';

// ASCII: "KOSM", "MIGR"
export const migrationLock = [0x4b4f534d, 0x4d494752] as const;

export async function runDatabaseMigrations({
  databaseUrl = process.env.DATABASE_URL,
  migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../../../drizzle'),
}: {
  databaseUrl?: string;
  migrationsFolder?: string;
} = {}): Promise<void> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run database migrations.');
  }

  const client = postgres(databaseUrl, {
    ssl: getPostgresSsl(),
    max: 1,
    connection: {
      idle_in_transaction_session_timeout: 30 * 1000,
      lock_timeout: 10 * 1000,
      statement_timeout: 10 * 60 * 1000,
    },
  });
  let lockAcquired = false;

  try {
    const [lock] = await client<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${migrationLock[0]}, ${migrationLock[1]}) AS acquired
    `;

    if (!lock?.acquired) {
      throw new Error('Another database migration is already running.');
    }

    lockAcquired = true;
    await migrate(drizzle({ client }), { migrationsFolder });
  } finally {
    if (lockAcquired) {
      await client`
        SELECT pg_advisory_unlock(${migrationLock[0]}, ${migrationLock[1]})
      `;
    }

    await client.end({ timeout: 5 });
  }
}

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypointUrl === import.meta.url) {
  await runDatabaseMigrations();
}
