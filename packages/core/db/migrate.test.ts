import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import { migrationLock, runDatabaseMigrations } from './migrate';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for migration integration tests.');
}

type MigrationFixture = { name: string; sql: string };

async function migrationFolder(
  first: string | readonly MigrationFixture[],
  sql?: string,
  ...rest: MigrationFixture[]
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kosmo-migrations-'));
  const migrations = typeof first === 'string' ? [{ name: first, sql: sql ?? '' }, ...rest] : first;

  for (const { name, sql: migrationSql } of migrations) {
    const migration = join(root, name);
    await mkdir(migration);
    await writeFile(join(migration, 'migration.sql'), migrationSql);
  }

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

test('파일별 transaction으로 앞 파일을 보존하고 실패 파일부터 재시도한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_file_first',
      sql: 'CREATE TABLE migration_file_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_file_second',
      sql: 'CREATE TABLE migration_file_second (id integer PRIMARY KEY);--> statement-breakpoint SELECT missing_migration_table;',
    },
    {
      name: '20260712000002_file_third',
      sql: 'CREATE TABLE migration_file_third (id integer PRIMARY KEY);',
    },
  ]);

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    await assert.rejects(runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }));

    const tablesAfterFailure = await control<{ tableName: string | null }[]>`
      SELECT to_regclass(table_name)::text AS "tableName"
      FROM unnest(ARRAY['public.migration_file_first', 'public.migration_file_second', 'public.migration_file_third']) AS table_name
    `;
    assert.deepEqual(
      tablesAfterFailure.map(({ tableName }) => tableName),
      ['migration_file_first', null, null],
    );
    assert.equal(
      (
        await control<{ count: number }[]>`
          SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
        `
      )[0]?.count,
      1,
    );

    await writeFile(
      join(migrations, '20260712000001_file_second', 'migration.sql'),
      'CREATE TABLE migration_file_second (id integer PRIMARY KEY);',
    );
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    const tablesAfterRetry = await control<{ tableName: string | null }[]>`
      SELECT to_regclass(table_name)::text AS "tableName"
      FROM unnest(ARRAY['public.migration_file_first', 'public.migration_file_second', 'public.migration_file_third']) AS table_name
    `;
    assert.deepEqual(
      tablesAfterRetry.map(({ tableName }) => tableName),
      ['migration_file_first', 'migration_file_second', 'migration_file_third'],
    );
    assert.equal(
      (
        await control<{ count: number }[]>`
          SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
        `
      )[0]?.count,
      3,
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('enum 값을 추가한 파일을 commit한 뒤 다음 파일에서 사용한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder(
    '20260712000000_enum_base',
    "CREATE TYPE migration_color AS ENUM ('RED');",
  );

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    await mkdir(join(migrations, '20260712000001_enum_add'));
    await writeFile(
      join(migrations, '20260712000001_enum_add', 'migration.sql'),
      "ALTER TYPE migration_color ADD VALUE 'BLUE';",
    );
    await mkdir(join(migrations, '20260712000002_enum_use'));
    await writeFile(
      join(migrations, '20260712000002_enum_use', 'migration.sql'),
      "CREATE TABLE migration_enum_probe (color migration_color NOT NULL DEFAULT 'BLUE'); INSERT INTO migration_enum_probe DEFAULT VALUES;",
    );
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    assert.deepEqual(
      (
        await control<{ color: string }[]>`
          SELECT color::text AS color FROM migration_enum_probe
        `
      ).map(({ color }) => color),
      ['BLUE'],
    );
    assert.equal(
      (
        await control<{ count: number }[]>`
          SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
        `
      )[0]?.count,
      3,
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('기존 legacy Drizzle history를 확장해 pending suffix를 이어서 적용한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_legacy_first',
      sql: 'CREATE TABLE migration_legacy_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_legacy_second',
      sql: 'CREATE TABLE migration_legacy_second (id integer PRIMARY KEY);',
    },
  ]);
  const [firstMigration] = readMigrationFiles({ migrationsFolder: migrations });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await control.unsafe(`
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
      CREATE TABLE migration_legacy_first (id integer PRIMARY KEY);
    `);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${firstMigration.hash}, ${firstMigration.folderMillis + 123})
    `;

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_legacy_first')::text AS "tableName"
        `
      )[0]?.tableName,
      'migration_legacy_first',
    );
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_legacy_second')::text AS "tableName"
        `
      )[0]?.tableName,
      'migration_legacy_second',
    );
    const history = await control<{ name: string | null; count: number }[]>`
      SELECT name, count(*) OVER ()::int AS count
      FROM drizzle.__drizzle_migrations
      ORDER BY id
    `;
    assert.deepEqual(
      history.map(({ name }) => name),
      ['20260712000000_legacy_first', '20260712000001_legacy_second'],
    );
    assert.equal(history[0]?.count, 2);
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('legacy history hash 불일치는 승격 전에 history와 SQL을 변경하지 않는다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_legacy_hash_first',
      sql: 'CREATE TABLE migration_legacy_hash_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_legacy_hash_second',
      sql: 'CREATE TABLE migration_legacy_hash_second (id integer PRIMARY KEY);',
    },
  ]);
  const [firstMigration] = readMigrationFiles({ migrationsFolder: migrations });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe(`
      CREATE SCHEMA public;
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${'legacy-hash'}, ${firstMigration.folderMillis + 123})
    `;

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /hash mismatch.*legacy row/,
    );

    const columns = await control<{ columnName: string }[]>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ORDER BY ordinal_position
    `;
    assert.deepEqual(
      columns.map(({ columnName }) => columnName),
      ['id', 'hash', 'created_at'],
    );
    assert.deepEqual(
      Array.from(
        await control<{ id: number; hash: string; createdAt: string }[]>`
          SELECT id, hash, created_at AS "createdAt"
          FROM drizzle.__drizzle_migrations
          ORDER BY id
        `,
      ),
      [{ id: 1, hash: 'legacy-hash', createdAt: String(firstMigration.folderMillis + 123) }],
    );
    assert.deepEqual(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass(table_name)::text AS "tableName"
          FROM unnest(ARRAY['public.migration_legacy_hash_first', 'public.migration_legacy_hash_second']) AS table_name
        `
      ).map(({ tableName }) => tableName),
      [null, null],
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('legacy history가 중간 migration을 건너뛰면 승격 전에 history와 SQL을 변경하지 않는다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_legacy_gap_first',
      sql: 'CREATE TABLE migration_legacy_gap_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_legacy_gap_second',
      sql: 'CREATE TABLE migration_legacy_gap_second (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000002_legacy_gap_third',
      sql: 'CREATE TABLE migration_legacy_gap_third (id integer PRIMARY KEY);',
    },
  ]);
  const [firstMigration, , thirdMigration] = readMigrationFiles({ migrationsFolder: migrations });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe(`
      CREATE SCHEMA public;
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES
        (${firstMigration.hash}, ${firstMigration.folderMillis + 123}),
        (${thirdMigration.hash}, ${thirdMigration.folderMillis + 123})
    `;

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /order mismatch.*legacy row/,
    );

    const columns = await control<{ columnName: string }[]>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ORDER BY ordinal_position
    `;
    assert.deepEqual(
      columns.map(({ columnName }) => columnName),
      ['id', 'hash', 'created_at'],
    );
    assert.deepEqual(
      Array.from(
        await control<{ id: number; hash: string; createdAt: string }[]>`
          SELECT id, hash, created_at AS "createdAt"
          FROM drizzle.__drizzle_migrations
          ORDER BY id
        `,
      ),
      [
        { id: 1, hash: firstMigration.hash, createdAt: String(firstMigration.folderMillis + 123) },
        { id: 2, hash: thirdMigration.hash, createdAt: String(thirdMigration.folderMillis + 123) },
      ],
    );
    assert.deepEqual(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass(table_name)::text AS "tableName"
          FROM unnest(ARRAY[
            'public.migration_legacy_gap_first',
            'public.migration_legacy_gap_second',
            'public.migration_legacy_gap_third'
          ]) AS table_name
        `
      ).map(({ tableName }) => tableName),
      [null, null, null],
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('partial history의 기존 name 불일치는 승격 전에 history와 SQL을 변경하지 않는다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_partial_name_first',
      sql: 'CREATE TABLE migration_partial_name_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_partial_name_second',
      sql: 'CREATE TABLE migration_partial_name_second (id integer PRIMARY KEY);',
    },
  ]);
  const [firstMigration] = readMigrationFiles({ migrationsFolder: migrations });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe(`
      CREATE SCHEMA public;
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        name text
      );
    `);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at, name)
      VALUES (${firstMigration.hash}, ${firstMigration.folderMillis + 123}, 'tampered_name')
    `;

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /history order mismatch/,
    );

    const columns = await control<{ columnName: string }[]>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ORDER BY ordinal_position
    `;
    assert.deepEqual(
      columns.map(({ columnName }) => columnName),
      ['id', 'hash', 'created_at', 'name'],
    );
    assert.deepEqual(
      Array.from(
        await control<{ id: number; hash: string; name: string }[]>`
          SELECT id, hash, name
          FROM drizzle.__drizzle_migrations
          ORDER BY id
        `,
      ),
      [{ id: 1, hash: firstMigration.hash, name: 'tampered_name' }],
    );
    assert.deepEqual(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass(table_name)::text AS "tableName"
          FROM unnest(ARRAY['public.migration_partial_name_first', 'public.migration_partial_name_second']) AS table_name
        `
      ).map(({ tableName }) => tableName),
      [null, null],
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('name이 없는 partial history는 기존 applied_at을 보존하며 승격한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_partial_applied_at_first',
      sql: 'CREATE TABLE migration_partial_applied_at_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_partial_applied_at_second',
      sql: 'CREATE TABLE migration_partial_applied_at_second (id integer PRIMARY KEY);',
    },
  ]);
  const [firstMigration] = readMigrationFiles({ migrationsFolder: migrations });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe(`
      CREATE SCHEMA public;
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        applied_at timestamp with time zone
      );
      CREATE TABLE migration_partial_applied_at_first (id integer PRIMARY KEY);
    `);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at, applied_at)
      VALUES (${firstMigration.hash}, ${firstMigration.folderMillis + 123}, '2026-08-03T12:34:56Z')
    `;

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    const history = await control<{ name: string | null; appliedAt: Date | null; count: number }[]>`
      SELECT name, applied_at AS "appliedAt", count(*) OVER ()::int AS count
      FROM drizzle.__drizzle_migrations
      ORDER BY id
    `;
    assert.deepEqual(
      history.map(({ name }) => name),
      ['20260712000000_partial_applied_at_first', '20260712000001_partial_applied_at_second'],
    );
    assert.deepEqual(history[0]?.appliedAt, new Date('2026-08-03T12:34:56Z'));
    assert.equal(history[0]?.count, 2);
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_partial_applied_at_second')::text AS "tableName"
        `
      )[0]?.tableName,
      'migration_partial_applied_at_second',
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('history insert 실패가 해당 파일의 schema를 rollback하고 앞 history를 보존한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder(
    '20260712000000_history_insert_first',
    'CREATE TABLE migration_history_insert_first (id integer PRIMARY KEY);',
  );

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    await mkdir(join(migrations, '20260712000001_history_insert_second'));
    await writeFile(
      join(migrations, '20260712000001_history_insert_second', 'migration.sql'),
      'CREATE TABLE migration_history_insert_second (id integer PRIMARY KEY);',
    );
    await control.unsafe(`
      ALTER TABLE drizzle.__drizzle_migrations
      ADD CONSTRAINT migration_history_insert_reject_second
      CHECK (name <> '20260712000001_history_insert_second')
    `);

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /migration_history_insert_reject_second/,
    );
    assert.deepEqual(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass(table_name)::text AS "tableName"
          FROM unnest(ARRAY['public.migration_history_insert_first', 'public.migration_history_insert_second']) AS table_name
        `
      ).map(({ tableName }) => tableName),
      ['migration_history_insert_first', null],
    );
    const history = await control<{ name: string | null; count: number }[]>`
      SELECT name, count(*) OVER ()::int AS count
      FROM drizzle.__drizzle_migrations
      ORDER BY id
    `;
    assert.deepEqual(
      history.map(({ name }) => name),
      ['20260712000000_history_insert_first'],
    );
    assert.equal(history[0]?.count, 1);
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('history hash가 달라지면 SQL 실행 전에 실패한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_hash_first',
      sql: 'CREATE TABLE migration_hash_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_hash_second',
      sql: 'CREATE TABLE migration_hash_second (id integer PRIMARY KEY);',
    },
  ]);

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });
    await control.unsafe('DROP TABLE migration_hash_second;');
    await writeFile(
      join(migrations, '20260712000000_hash_first', 'migration.sql'),
      'CREATE TABLE migration_hash_first (id bigint PRIMARY KEY);',
    );

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /hash mismatch/,
    );
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_hash_second')::text AS "tableName"
        `
      )[0]?.tableName,
      null,
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('history가 local migration prefix를 건너뛰면 SQL 실행 전에 실패한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_prefix_first',
      sql: 'CREATE TABLE migration_prefix_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_prefix_second',
      sql: 'CREATE TABLE migration_prefix_second (id integer PRIMARY KEY);',
    },
  ]);

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });
    await control`DELETE FROM drizzle.__drizzle_migrations WHERE id = 1`;

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /history order mismatch/,
    );
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_prefix_first')::text AS "tableName"
        `
      )[0]?.tableName,
      'migration_prefix_first',
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
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
  const validMigrations = await migrationFolder([
    {
      name: '20260712000000_owner_first',
      sql: `
        CREATE TABLE migration_owner_sessions (
          migration_name text PRIMARY KEY,
          backend_pid integer NOT NULL,
          current_user_name name NOT NULL
        );
        INSERT INTO migration_owner_sessions (migration_name, backend_pid, current_user_name)
        VALUES ('first', pg_backend_pid(), current_user);
      `,
    },
    {
      name: '20260712000001_owner_second',
      sql: `
        CREATE TABLE migration_owner_probe (id integer PRIMARY KEY);
        INSERT INTO migration_owner_sessions (migration_name, backend_pid, current_user_name)
        VALUES ('second', pg_backend_pid(), current_user);
      `,
    },
  ]);
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

    const sessions = await control<
      { migrationName: string; backendPid: number; currentUser: string }[]
    >`
      SELECT migration_name AS "migrationName",
        backend_pid AS "backendPid",
        current_user_name AS "currentUser"
      FROM migration_owner_sessions
      ORDER BY migration_name
    `;
    assert.deepEqual(
      sessions.map(({ migrationName }) => migrationName),
      ['first', 'second'],
    );
    assert.equal(new Set(sessions.map(({ backendPid }) => backendPid)).size, 1);
    assert.deepEqual(
      sessions.map(({ currentUser }) => currentUser),
      [ownerRole, ownerRole],
    );

    const owners = await control<{ owner: string }[]>`
      SELECT pg_get_userbyid(relowner) AS owner
      FROM pg_class
      WHERE oid IN (
        'public.migration_owner_probe'::regclass,
        'public.migration_owner_sessions'::regclass,
        'drizzle.__drizzle_migrations'::regclass
      )
      ORDER BY relname
    `;
    assert.deepEqual(
      owners.map(({ owner }) => owner),
      [ownerRole, ownerRole, ownerRole],
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
