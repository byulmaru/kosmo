import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// ASCII: "KOSM", "MIGR"
export const migrationLock = [0x4b4f534d, 0x4d494752] as const;

export async function runDatabaseMigrations({
  databaseUrl = process.env.DATABASE_URL,
  migrationRole = process.env.DATABASE_MIGRATION_ROLE,
  migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../../../drizzle'),
}: {
  databaseUrl?: string;
  migrationRole?: string;
  migrationsFolder?: string;
} = {}): Promise<void> {
  if (!databaseUrl) {
    const requiredEnvironment = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
    const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

    if (missingEnvironment.length > 0) {
      throw new Error(
        `DATABASE_URL or PostgreSQL environment is required to run database migrations; missing ${missingEnvironment.join(', ')}.`,
      );
    }
  }

  const clientOptions = {
    max: 1,
    connection: {
      idle_in_transaction_session_timeout: 30 * 1000,
      lock_timeout: 10 * 1000,
      statement_timeout: 10 * 60 * 1000,
    },
  };
  const client = databaseUrl ? postgres(databaseUrl, clientOptions) : postgres(clientOptions);
  let lockAcquired = false;

  try {
    const [lock] = await client<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${migrationLock[0]}, ${migrationLock[1]}) AS acquired
    `;

    if (!lock?.acquired) {
      throw new Error('Another database migration is already running.');
    }

    lockAcquired = true;

    if (migrationRole) {
      await client`SET ROLE ${client(migrationRole)}`;
    }

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
