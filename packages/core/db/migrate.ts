import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import type { MigrationMeta } from 'drizzle-orm/migrator';

// ASCII: "KOSM", "MIGR"
export const migrationLock = [0x4b4f534d, 0x4d494752] as const;

const migrationsSchema = 'drizzle';
const migrationsTable = '__drizzle_migrations';

type MigrationHistoryRow = {
  id: number;
  hash: string;
  name: string | null;
};

type LegacyMigrationHistoryRow = Pick<MigrationHistoryRow, 'id' | 'hash'>;

type MigrationClient = ReturnType<typeof postgres>;

function migrationTableReference(sql: MigrationClient) {
  return sql`${sql(migrationsSchema)}.${sql(migrationsTable)}`;
}

async function runMigrationTransaction(
  sql: MigrationClient,
  callback: (transaction: MigrationClient) => Promise<void>,
): Promise<void> {
  // postgres.js reserved clients expose query primitives but not `.begin` at runtime.
  await sql`BEGIN`;

  try {
    await callback(sql);
    await sql`COMMIT`;
  } catch (error) {
    try {
      await sql`ROLLBACK`;
    } catch {
      // Preserve the migration error when the connection cannot roll back.
    }

    throw error;
  }
}

function validateLegacyMigrationHistory(
  rows: LegacyMigrationHistoryRow[],
  migrations: MigrationMeta[],
): void {
  if (rows.length > migrations.length) {
    throw new Error(
      `Database migration history has ${rows.length} rows, but only ${migrations.length} local migrations exist.`,
    );
  }

  for (const [index, row] of rows.entries()) {
    const migration = migrations[index];

    if (!migration) {
      throw new Error(
        `Database migration history row ${row.id} has no local migration at position ${index + 1}.`,
      );
    }

    if (row.hash !== migration.hash) {
      const foundIndex = migrations.findIndex(({ hash }) => hash === row.hash);
      if (foundIndex >= 0) {
        throw new Error(
          `Database migration history order mismatch at legacy row ${row.id}; expected ${migration.name}, found ${migrations[foundIndex]?.name ?? 'unknown'}.`,
        );
      }

      throw new Error(
        `Database migration history hash mismatch for legacy row ${row.id}; expected ${migration.name}, refusing to execute new SQL.`,
      );
    }
  }
}

async function ensureMigrationHistory(
  sql: MigrationClient,
  migrations: MigrationMeta[],
): Promise<void> {
  const table = migrationTableReference(sql);
  const tableRows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = ${migrationsSchema}
        AND table_name = ${migrationsTable}
    ) AS exists
  `;

  if (!tableRows[0]?.exists) {
    await sql`CREATE SCHEMA IF NOT EXISTS ${sql(migrationsSchema)}`;
    await sql`
      CREATE TABLE IF NOT EXISTS ${table} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        name text,
        applied_at timestamp with time zone DEFAULT now()
      )
    `;
    return;
  }

  const columns = await sql<{ columnName: string }[]>`
    SELECT column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = ${migrationsSchema}
      AND table_name = ${migrationsTable}
    ORDER BY ordinal_position
  `;
  const columnNames = new Set(columns.map(({ columnName }) => columnName));
  const requiredColumns = ['id', 'hash', 'created_at'];
  const missingColumns = requiredColumns.filter((column) => !columnNames.has(column));

  if (missingColumns.length > 0) {
    throw new Error(
      `Unsupported ${migrationsSchema}.${migrationsTable} history shape; missing ${missingColumns.join(', ')}.`,
    );
  }

  if (columnNames.has('name') && columnNames.has('applied_at')) {
    return;
  }

  const legacyRows = await sql<LegacyMigrationHistoryRow[]>`
    SELECT id, hash
    FROM ${table}
    ORDER BY id ASC
  `;
  validateLegacyMigrationHistory(legacyRows, migrations);

  await runMigrationTransaction(sql, async (transaction) => {
    if (!columnNames.has('name')) {
      await transaction`
        ALTER TABLE ${table}
        ADD COLUMN name text
      `;
    }

    if (!columnNames.has('applied_at')) {
      await transaction`
        ALTER TABLE ${table}
        ADD COLUMN applied_at timestamp with time zone DEFAULT now()
      `;
    }

    for (const [index, row] of legacyRows.entries()) {
      const migration = migrations[index];
      await transaction`
        UPDATE ${table}
        SET name = ${migration.name}, applied_at = NULL
        WHERE id = ${row.id}
      `;
    }
  });
}

async function readMigrationHistory(sql: MigrationClient): Promise<MigrationHistoryRow[]> {
  const table = migrationTableReference(sql);

  return sql<MigrationHistoryRow[]>`
    SELECT id, hash, name
    FROM ${table}
    ORDER BY id ASC
  `;
}

function validateMigrationHistory(
  history: MigrationHistoryRow[],
  migrations: MigrationMeta[],
): void {
  if (history.length > migrations.length) {
    throw new Error(
      `Database migration history has ${history.length} rows, but only ${migrations.length} local migrations exist.`,
    );
  }

  for (const [index, row] of history.entries()) {
    const migration = migrations[index];

    if (!migration) {
      throw new Error(
        `Database migration history row ${row.id} has no local migration at position ${index + 1}.`,
      );
    }

    if (row.name !== migration.name) {
      throw new Error(
        `Database migration history order mismatch at row ${row.id}; expected ${migration.name}, found ${row.name ?? 'NULL'}.`,
      );
    }

    if (row.hash !== migration.hash) {
      throw new Error(
        `Database migration history hash mismatch for ${migration.name}; refusing to execute new SQL.`,
      );
    }
  }
}

async function applyMigrationFile(sql: MigrationClient, migration: MigrationMeta): Promise<void> {
  const table = migrationTableReference(sql);

  await runMigrationTransaction(sql, async (transaction) => {
    for (const statement of migration.sql) {
      await transaction.unsafe(statement);
    }

    await transaction`
      INSERT INTO ${table} (hash, created_at, name)
      VALUES (${migration.hash}, ${migration.folderMillis}, ${migration.name})
    `;
  });
}

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
    max_lifetime: null,
    connection: {
      idle_in_transaction_session_timeout: 30 * 1000,
      lock_timeout: 10 * 1000,
      statement_timeout: 10 * 60 * 1000,
    },
  };
  const client = databaseUrl ? postgres(databaseUrl, clientOptions) : postgres(clientOptions);
  type ReservedMigrationClient = Awaited<ReturnType<MigrationClient['reserve']>>;
  let session: ReservedMigrationClient | undefined;
  let lockAcquired = false;

  try {
    session = await client.reserve();

    const [lock] = await session<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${migrationLock[0]}, ${migrationLock[1]}) AS acquired
    `;

    if (!lock?.acquired) {
      throw new Error('Another database migration is already running.');
    }

    lockAcquired = true;

    if (migrationRole) {
      await session`SET ROLE ${session(migrationRole)}`;
    }

    const migrations = readMigrationFiles({ migrationsFolder });
    await ensureMigrationHistory(session, migrations);
    const history = await readMigrationHistory(session);
    validateMigrationHistory(history, migrations);

    for (const migration of migrations.slice(history.length)) {
      await applyMigrationFile(session, migration);
    }
  } finally {
    try {
      if (session && lockAcquired) {
        await session`
          SELECT pg_advisory_unlock(${migrationLock[0]}, ${migrationLock[1]})
        `;
      }
    } finally {
      try {
        session?.release();
      } finally {
        await client.end({ timeout: 5 });
      }
    }
  }
}

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypointUrl === import.meta.url) {
  await runDatabaseMigrations();
}
