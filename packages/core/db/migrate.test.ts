import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import postgres from 'postgres';
import { migrationLock, runDatabaseMigrations } from './migrate';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for migration integration tests.');
}

async function migrationFolder(name: string, sql: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kosmo-migrations-'));
  const migration = join(root, name);
  await mkdir(migration);
  await writeFile(join(migration, 'migration.sql'), sql);
  return root;
}

test('마이그레이션을 한 번만 적용하고 동시 실행을 거부하며 실패를 롤백한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const validMigrations = await migrationFolder(
    '20260712000000_valid',
    'CREATE TABLE migration_probe (id integer PRIMARY KEY);',
  );
  const invalidMigrations = await migrationFolder(
    '20260712000001_invalid',
    'CREATE TABLE invalid_migration (',
  );

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: validMigrations });
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
        SELECT to_regclass('public.migration_probe')::text AS "tableName"
      `
      )[0]?.tableName,
      'migration_probe',
    );
    assert.equal(
      (
        await control<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
      )[0]?.count,
      1,
    );

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: validMigrations });
    assert.equal(
      (
        await control<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
      )[0]?.count,
      1,
    );

    await control`SELECT pg_advisory_lock(${migrationLock[0]}, ${migrationLock[1]})`;
    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: validMigrations }),
      /Another database migration is already running/,
    );
    await control`SELECT pg_advisory_unlock(${migrationLock[0]}, ${migrationLock[1]})`;

    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: invalidMigrations }),
    );
    assert.equal(
      (
        await control<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
      )[0]?.count,
      0,
    );
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
        SELECT to_regclass('public.invalid_migration')::text AS "tableName"
      `
      )[0]?.tableName,
      null,
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(validMigrations, { force: true, recursive: true });
    await rm(invalidMigrations, { force: true, recursive: true });
  }
});

test('현재 마이그레이션 이력을 빈 데이터베이스에 적용한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    await runDatabaseMigrations({ databaseUrl });
    const [{ count: appliedCount }] = await control<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    assert.ok(appliedCount > 0);

    await runDatabaseMigrations({ databaseUrl });
    const [{ count: reappliedCount }] = await control<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    assert.equal(reappliedCount, appliedCount);
  } finally {
    await control.end({ timeout: 5 });
  }
});
