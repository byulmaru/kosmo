import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import drizzleConfig from '../drizzle.config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for migration smoke tests.');
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(packageRoot, '../..');
const migrationsRoot = drizzleConfig.out;
const migrationCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const localMigrations = readMigrationFiles({ migrationsFolder: migrationsRoot });
const migrationNames = localMigrations.map(({ name }) => name);

assert.ok(migrationNames.length > 0, 'The repository must contain Drizzle migrations.');

const firstRun = runMigrationEntrypoint();
assert.equal(firstRun.status, 0, formatFailure('blank database migration replay failed', firstRun));
assert.equal(
  firstRun.signal,
  null,
  formatFailure('blank database migration replay was signalled', firstRun),
);

const sql = postgres(databaseUrl, { max: 1 });
const { schema: migrationsSchema, table: migrationsTable } = drizzleConfig.migrations;
type MigrationHistoryRow = {
  id: number;
  name: string | null;
  hash: string;
  createdAt: string;
  appliedAt: string | null;
};
const readHistory = () => sql<MigrationHistoryRow[]>`
  SELECT id, name, hash, created_at::text AS "createdAt", applied_at::text AS "appliedAt"
  FROM ${sql(migrationsSchema)}.${sql(migrationsTable)}
  ORDER BY id ASC
`;

try {
  const freshHistory = await readHistory();

  assert.equal(
    freshHistory.length,
    migrationNames.length,
    'Migration history row count must match local files.',
  );
  assert.deepEqual(
    freshHistory.map(({ name }) => name),
    migrationNames,
    'Fresh migration history must contain all local migration names in version-control order.',
  );
  // Reverse the disposable fixture's history IDs to model a parallel-branch
  // apply order while preserving each migration's name, hash, and timestamps.
  await sql`UPDATE ${sql(migrationsSchema)}.${sql(migrationsTable)} SET id = -id`;
  const nonlinearHistory = await readHistory();
  assert.notDeepEqual(
    nonlinearHistory.map(({ name }) => name),
    freshHistory.map(({ name }) => name),
    'Smoke fixture must reorder history into a non-linear order.',
  );
  assert.deepEqual(
    [...nonlinearHistory].sort((a, b) => a.name!.localeCompare(b.name!)).map(({ name }) => name),
    migrationNames,
    'Non-linear history must preserve the complete local name set.',
  );

  const secondRun = runMigrationEntrypoint();
  assert.equal(
    secondRun.status,
    0,
    formatFailure('non-linear history no-op rerun failed', secondRun),
  );
  assert.equal(
    secondRun.signal,
    null,
    formatFailure('non-linear history no-op rerun was signalled', secondRun),
  );

  const historyAfterNoop = await readHistory();
  assert.deepEqual(
    historyAfterNoop,
    nonlinearHistory,
    'Non-linear no-op rerun must not change migration history.',
  );

  const objects = await sql<{ objectName: string | null }[]>`
    SELECT to_regclass(object_name)::text AS "objectName"
    FROM unnest(${sql.array([
      'public.account',
      'public.profile',
      'public.post',
      'public.media',
      'public.profile_media',
      'public.hashtag',
    ])}::text[]) AS object_name
  `;

  assert.deepEqual(
    objects.map(({ objectName }) => objectName),
    ['account', 'profile', 'post', 'media', 'profile_media', 'hashtag'],
    'Representative final schema tables must exist.',
  );

  const columns = Array.from(
    await sql<{ tableName: string; columnName: string }[]>`
      SELECT table_name AS "tableName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'post' AND column_name IN ('reply_parent_id', 'repost_source_id'))
          OR (
            table_name = 'media'
            AND column_name IN ('source', 'state', 'storage_reference', 'media_type', 'url', 'ready_at', 'alt_text')
          )
        )
      ORDER BY table_name, column_name
    `,
  );

  assert.deepEqual(
    columns,
    [
      { tableName: 'media', columnName: 'alt_text' },
      { tableName: 'media', columnName: 'media_type' },
      { tableName: 'media', columnName: 'ready_at' },
      { tableName: 'media', columnName: 'source' },
      { tableName: 'media', columnName: 'state' },
      { tableName: 'media', columnName: 'storage_reference' },
      { tableName: 'media', columnName: 'url' },
      { tableName: 'post', columnName: 'reply_parent_id' },
      { tableName: 'post', columnName: 'repost_source_id' },
    ],
    'Representative final schema columns must exist.',
  );
} finally {
  await sql.end({ timeout: 5 });
}

function runMigrationEntrypoint() {
  return spawnSync(migrationCommand, ['--filter', '@kosmo/core', 'db:migrate'], {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
}

function formatFailure(
  description: string,
  result: ReturnType<typeof runMigrationEntrypoint>,
): string {
  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';
  const error = result.error?.message;

  return [
    description,
    `cwd: ${repositoryRoot}`,
    'DATABASE_URL: set',
    `status: ${result.status ?? '(null)'}`,
    `signal: ${result.signal ?? '(none)'}`,
    error ? `spawn error: ${error}` : '',
    `stdout:\n${stdout || '(empty)'}`,
    `stderr:\n${stderr || '(empty)'}`,
  ]
    .filter(Boolean)
    .join('\n');
}
