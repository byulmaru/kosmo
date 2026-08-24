import { pathToFileURL } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import drizzleConfig from '../drizzle.config';
import type { MigrationMeta } from 'drizzle-orm/migrator';

// ASCII: "KOSM", "MIGR"
export const migrationLock = [0x4b4f534d, 0x4d494752] as const;

const { schema: migrationsSchema, table: migrationsTable } = drizzleConfig.migrations;

type MigrationHistoryRow = {
  id: number;
  hash: string;
  name: string | null;
};

type LegacyMigrationHistoryRow = Pick<MigrationHistoryRow, 'id' | 'hash'> & {
  createdAt: string | number | null;
};

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

function indexLocalMigrations(migrations: MigrationMeta[]): Map<string, MigrationMeta> {
  const byName = new Map<string, MigrationMeta>();

  for (const migration of migrations) {
    if (byName.has(migration.name)) {
      throw new Error(`Local migration directory contains duplicate name ${migration.name}.`);
    }

    byName.set(migration.name, migration);
  }

  return byName;
}

function legacyCreatedAtToMillis(createdAt: LegacyMigrationHistoryRow['createdAt']): number | null {
  if (createdAt === null) {
    return null;
  }

  const stringified = String(createdAt);

  if (!/^\d+$/.test(stringified) || stringified.length < 4) {
    return null;
  }

  const millis = Number(`${stringified.slice(0, -3)}000`);
  return Number.isSafeInteger(millis) ? millis : null;
}

type LegacyMigrationMatch = {
  migration: MigrationMeta;
  row: LegacyMigrationHistoryRow;
};

function mapLegacyMigrationHistory(
  rows: LegacyMigrationHistoryRow[],
  migrations: MigrationMeta[],
): LegacyMigrationMatch[] {
  if (rows.length > migrations.length) {
    throw new Error(
      `Database migration history has ${rows.length} rows, but only ${migrations.length} local migrations exist.`,
    );
  }

  const byMillis = new Map<number, MigrationMeta[]>();
  const byHash = new Map<string, MigrationMeta[]>();

  for (const migration of migrations) {
    const millisMigrations = byMillis.get(migration.folderMillis) ?? [];
    millisMigrations.push(migration);
    byMillis.set(migration.folderMillis, millisMigrations);

    const hashMigrations = byHash.get(migration.hash) ?? [];
    hashMigrations.push(migration);
    byHash.set(migration.hash, hashMigrations);
  }

  const matches: LegacyMigrationMatch[] = [];
  const matchedNames = new Map<string, number>();

  for (const row of rows) {
    const millis = legacyCreatedAtToMillis(row.createdAt);
    const timestampCandidates = millis === null ? undefined : byMillis.get(millis);
    let migration: MigrationMeta | undefined;

    // This intentionally mirrors Drizzle beta.22's PostgreSQL upgrader: a
    // unique timestamp wins, a shared timestamp is disambiguated by hash, and
    // hash is used as a fallback only when no timestamp candidate exists.
    if (timestampCandidates && timestampCandidates.length === 1) {
      migration = timestampCandidates[0];

      if (migration.hash !== row.hash) {
        throw new Error(
          `Database migration history hash mismatch for legacy row ${row.id}; expected ${migration.name}, refusing to execute new SQL.`,
        );
      }
    } else if (timestampCandidates && timestampCandidates.length > 1) {
      const hashCandidates = timestampCandidates.filter(({ hash }) => hash === row.hash);

      if (hashCandidates.length === 1) {
        migration = hashCandidates[0];
      } else if (hashCandidates.length > 1) {
        throw new Error(
          `Database migration history legacy row ${row.id} has an ambiguous timestamp/hash mapping.`,
        );
      }
    } else {
      const hashCandidates = byHash.get(row.hash) ?? [];

      if (hashCandidates.length === 1) {
        migration = hashCandidates[0];
      } else if (hashCandidates.length > 1) {
        throw new Error(
          `Database migration history legacy row ${row.id} has an ambiguous hash mapping.`,
        );
      }
    }

    if (!migration) {
      throw new Error(
        `Database migration history legacy row ${row.id} does not match any local migration by timestamp/hash.`,
      );
    }

    const previousRowId = matchedNames.get(migration.name);

    if (previousRowId !== undefined) {
      throw new Error(
        `Database migration history legacy rows ${previousRowId} and ${row.id} map to duplicate migration ${migration.name}.`,
      );
    }

    matchedNames.set(migration.name, row.id);
    matches.push({ migration, row });
  }

  return matches;
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

  if (columnNames.has('name')) {
    const partialRows = await readMigrationHistory(sql);
    validateMigrationHistory(partialRows, migrations);

    await runMigrationTransaction(sql, async (transaction) => {
      await transaction`
        ALTER TABLE ${table}
        ADD COLUMN applied_at timestamp with time zone DEFAULT now()
      `;
      await transaction`UPDATE ${table} SET applied_at = NULL`;
    });
    return;
  }

  {
    const legacyRows = await sql<LegacyMigrationHistoryRow[]>`
      SELECT id, hash, created_at AS "createdAt"
      FROM ${table}
      ORDER BY id ASC
    `;
    const matches = mapLegacyMigrationHistory(legacyRows, migrations);

    await runMigrationTransaction(sql, async (transaction) => {
      await transaction`
        ALTER TABLE ${table}
        ADD COLUMN name text
      `;

      if (!columnNames.has('applied_at')) {
        await transaction`
          ALTER TABLE ${table}
          ADD COLUMN applied_at timestamp with time zone DEFAULT now()
        `;
      }

      for (const { migration, row } of matches) {
        if (columnNames.has('applied_at')) {
          await transaction`
            UPDATE ${table}
            SET name = ${migration.name}
            WHERE id = ${row.id}
          `;
        } else {
          await transaction`
            UPDATE ${table}
            SET name = ${migration.name}, applied_at = NULL
            WHERE id = ${row.id}
          `;
        }
      }
    });
  }
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
): Set<string> {
  if (history.length > migrations.length) {
    throw new Error(
      `Database migration history has ${history.length} rows, but only ${migrations.length} local migrations exist.`,
    );
  }

  const migrationsByName = indexLocalMigrations(migrations);
  const appliedNames = new Set<string>();

  for (const row of history) {
    if (!row.name) {
      throw new Error(
        `Database migration history row ${row.id} has no local migration name, refusing to execute new SQL.`,
      );
    }

    if (appliedNames.has(row.name)) {
      throw new Error(
        `Database migration history contains duplicate name ${row.name} at row ${row.id}.`,
      );
    }

    const migration = migrationsByName.get(row.name);

    if (!migration) {
      throw new Error(
        `Database migration history row ${row.id} references unknown migration ${row.name}, refusing to execute new SQL.`,
      );
    }

    if (row.hash !== migration.hash) {
      throw new Error(
        `Database migration history hash mismatch for ${row.name}; refusing to execute new SQL.`,
      );
    }

    appliedNames.add(row.name);
  }

  return appliedNames;
}

async function applyMigrationFile(sql: MigrationClient, migration: MigrationMeta): Promise<void> {
  const table = migrationTableReference(sql);

  await runMigrationTransaction(sql, async (transaction) => {
    for (const statement of migration.sql) {
      await transaction.unsafe(statement);
    }

    await transaction`
      INSERT INTO ${table} (hash, created_at, name, applied_at)
      VALUES (${migration.hash}, ${migration.folderMillis}, ${migration.name}, now())
    `;
  });
}

export async function runDatabaseMigrations({
  databaseUrl = process.env.DATABASE_URL,
  migrationsFolder = drizzleConfig.out,
}: {
  databaseUrl?: string;
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

    const migrations = readMigrationFiles({ migrationsFolder });
    await ensureMigrationHistory(session, migrations);
    const history = await readMigrationHistory(session);
    const appliedNames = validateMigrationHistory(history, migrations);

    for (const migration of migrations) {
      if (!appliedNames.has(migration.name)) {
        await applyMigrationFile(session, migration);
      }
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
