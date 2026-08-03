import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const migrationNames = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter(
    (entry) => entry.isDirectory() && existsSync(join(migrationsRoot, entry.name, 'migration.sql')),
  )
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

assert.ok(migrationNames.length > 0, 'The repository must contain Drizzle migrations.');

const firstRun = runMigrationEntrypoint();
assert.equal(firstRun.status, 0, formatFailure('blank database migration replay failed', firstRun));
assert.equal(
  firstRun.signal,
  null,
  formatFailure('blank database migration replay was signalled', firstRun),
);

// Pending-suffix retry is covered by migrate.test.ts; this process smoke stays focused on the CLI boundary.
const secondRun = runMigrationEntrypoint();
assert.equal(secondRun.status, 0, formatFailure('migration no-op rerun failed', secondRun));
assert.equal(
  secondRun.signal,
  null,
  formatFailure('migration no-op rerun was signalled', secondRun),
);

const sql = postgres(databaseUrl, { max: 1 });
const { schema: migrationsSchema, table: migrationsTable } = drizzleConfig.migrations;

try {
  const history = await sql<{ name: string | null }[]>`
    SELECT name
    FROM ${sql(migrationsSchema)}.${sql(migrationsTable)}
    ORDER BY id ASC
  `;

  assert.equal(
    history.length,
    migrationNames.length,
    'Migration history row count must match local files.',
  );
  assert.deepEqual(
    history.map(({ name }) => name),
    migrationNames,
    'Migration history must contain the complete local migration prefix in order.',
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
