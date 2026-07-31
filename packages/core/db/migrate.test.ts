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

test('PostgreSQL 환경 변수로 마이그레이션 database에 연결한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const validMigrations = await migrationFolder(
    '20260712000000_environment',
    'CREATE TABLE migration_environment_probe (id integer PRIMARY KEY);',
  );
  const connection = new URL(databaseUrl);
  const environmentNames = [
    'DATABASE_URL',
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
  ] as const;
  const previousEnvironment = new Map(
    environmentNames.map((name) => [name, process.env[name]] as const),
  );

  delete process.env.DATABASE_URL;
  process.env.PGHOST = connection.hostname;
  process.env.PGPORT = connection.port || '5432';
  process.env.PGDATABASE = decodeURIComponent(connection.pathname.slice(1));
  process.env.PGUSER = decodeURIComponent(connection.username);
  process.env.PGPASSWORD = decodeURIComponent(connection.password);

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ migrationsFolder: validMigrations });
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
        SELECT to_regclass('public.migration_environment_probe')::text AS "tableName"
      `
      )[0]?.tableName,
      'migration_environment_probe',
    );
  } finally {
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    await control.end({ timeout: 5 });
    await rm(validMigrations, { force: true, recursive: true });
  }
});

test('별도 로그인으로 연결해도 지정한 database owner role로 객체를 생성한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const ownerRole = `migration_owner_${process.pid}`;
  const validMigrations = await migrationFolder(
    '20260712000000_owner',
    'CREATE TABLE migration_owner_probe (id integer PRIMARY KEY);',
  );
  const [{ currentUser }] = await control<
    { currentUser: string }[]
  >`SELECT current_user AS "currentUser"`;
  const [{ databaseName }] = await control<
    { databaseName: string }[]
  >`SELECT current_database() AS "databaseName"`;
  let roleCreated = false;

  try {
    await control`CREATE ROLE ${control(ownerRole)}`;
    roleCreated = true;
    await control`GRANT ${control(ownerRole)} TO ${control(currentUser)}`;
    await control`GRANT CREATE ON DATABASE ${control(databaseName)} TO ${control(ownerRole)}`;
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await control`GRANT ALL ON SCHEMA public TO ${control(ownerRole)}`;

    await runDatabaseMigrations({
      databaseUrl,
      migrationRole: ownerRole,
      migrationsFolder: validMigrations,
    });

    const owners = await control<{ owner: string }[]>`
      SELECT pg_get_userbyid(relowner) AS owner
      FROM pg_class
      WHERE oid IN (
        'public.migration_owner_probe'::regclass,
        'drizzle.__drizzle_migrations'::regclass
      )
      ORDER BY relname
    `;
    assert.deepEqual(
      owners.map(({ owner }) => owner),
      [ownerRole, ownerRole],
    );
  } finally {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    if (roleCreated) {
      await control`REVOKE CREATE ON DATABASE ${control(databaseName)} FROM ${control(ownerRole)}`;
      await control`REVOKE ${control(ownerRole)} FROM ${control(currentUser)}`;
      await control`DROP ROLE ${control(ownerRole)}`;
    }

    await control.end({ timeout: 5 });
    await rm(validMigrations, { force: true, recursive: true });
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
