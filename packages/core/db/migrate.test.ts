import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import drizzleConfig from '../drizzle.config';
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

async function migrationHistoryColumns(control: ReturnType<typeof postgres>) {
  return Array.from(
    await control<{ columnName: string }[]>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ORDER BY ordinal_position
    `,
  );
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

test('비선형 current history에서 적용된 name을 건너뛰고 pending을 local 순서로 적용한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_current_first',
      sql: 'CREATE TABLE migration_current_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_current_second',
      sql: 'CREATE TABLE migration_current_second (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000002_current_third',
      sql: 'CREATE TABLE migration_current_third (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000003_current_fourth',
      sql: 'CREATE TABLE migration_current_fourth (id integer PRIMARY KEY);',
    },
  ]);
  const [firstMigration, secondMigration, thirdMigration, fourthMigration] = readMigrationFiles({
    migrationsFolder: migrations,
  });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe(`
      CREATE SCHEMA public;
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        name text,
        applied_at timestamp with time zone DEFAULT now()
      );
      CREATE TABLE migration_current_first (id integer PRIMARY KEY);
      CREATE TABLE migration_current_third (id integer PRIMARY KEY);
    `);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at, name)
      VALUES
        (${thirdMigration.hash}, ${thirdMigration.folderMillis}, ${thirdMigration.name}),
        (${firstMigration.hash}, ${firstMigration.folderMillis}, ${firstMigration.name})
    `;

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    assert.deepEqual(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass(table_name)::text AS "tableName"
          FROM unnest(ARRAY[
            'public.migration_current_first',
            'public.migration_current_second',
            'public.migration_current_third',
            'public.migration_current_fourth'
          ]) AS table_name
        `
      ).map(({ tableName }) => tableName),
      [
        'migration_current_first',
        'migration_current_second',
        'migration_current_third',
        'migration_current_fourth',
      ],
    );

    const history = await control<{ id: number; name: string; hash: string }[]>`
      SELECT id, name, hash
      FROM drizzle.__drizzle_migrations
      ORDER BY id
    `;
    assert.deepEqual(
      history.map(({ id, name }) => ({ id, name })),
      [
        { id: 1, name: thirdMigration.name },
        { id: 2, name: firstMigration.name },
        { id: 3, name: secondMigration.name },
        { id: 4, name: fourthMigration.name },
      ],
    );
    assert.deepEqual(
      history.map(({ hash }) => hash),
      [thirdMigration.hash, firstMigration.hash, secondMigration.hash, fourthMigration.hash],
    );

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });
    assert.deepEqual(
      await control<{ id: number; name: string; hash: string }[]>`
        SELECT id, name, hash
        FROM drizzle.__drizzle_migrations
        ORDER BY id
      `,
      history,
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('current history의 unknown name은 새 SQL 전에 거부한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder(
    '20260712000000_current_unknown',
    'CREATE TABLE migration_current_unknown (id integer PRIMARY KEY);',
  );

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe(`
      CREATE SCHEMA public;
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        name text,
        applied_at timestamp with time zone DEFAULT now()
      );
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at, name)
      VALUES ('unknown-hash', 0, '20260711000000_missing');
    `);

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /unknown migration/,
    );
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_current_unknown')::text AS "tableName"
        `
      )[0]?.tableName,
      null,
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('current history의 duplicate name은 새 SQL 전에 거부한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_current_duplicate_first',
      sql: 'CREATE TABLE migration_current_duplicate_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_current_duplicate_second',
      sql: 'CREATE TABLE migration_current_duplicate_second (id integer PRIMARY KEY);',
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
        name text,
        applied_at timestamp with time zone DEFAULT now()
      );
    `);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at, name)
      VALUES
        (${firstMigration.hash}, ${firstMigration.folderMillis}, ${firstMigration.name}),
        (${firstMigration.hash}, ${firstMigration.folderMillis}, ${firstMigration.name})
    `;

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /duplicate name/,
    );
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_current_duplicate_first')::text AS "tableName"
        `
      )[0]?.tableName,
      null,
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

test('legacy history가 local migration과 대응하지 않으면 승격 전에 거부한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder(
    '20260712000000_legacy_unknown',
    'CREATE TABLE migration_legacy_unknown (id integer PRIMARY KEY);',
  );

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
      VALUES ('legacy-unknown-hash', 0)
    `;

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /does not match any local migration/,
    );
    assert.deepEqual(await migrationHistoryColumns(control), [
      { columnName: 'id' },
      { columnName: 'hash' },
      { columnName: 'created_at' },
    ]);
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('비선형 legacy history를 row 순서와 ID 그대로 승격하고 pending migration을 적용한다', async () => {
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
      CREATE TABLE migration_legacy_gap_first (id integer PRIMARY KEY);
      CREATE TABLE migration_legacy_gap_third (id integer PRIMARY KEY);
    `);
    await control`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES
        (${firstMigration.hash}, ${firstMigration.folderMillis + 123}),
        (${thirdMigration.hash}, ${thirdMigration.folderMillis + 123})
    `;

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    const columns = await control<{ columnName: string }[]>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ORDER BY ordinal_position
    `;
    assert.deepEqual(
      columns.map(({ columnName }) => columnName),
      ['id', 'hash', 'created_at', 'name', 'applied_at'],
    );
    const history = await control<{ id: number; hash: string; name: string }[]>`
      SELECT id, hash, name
      FROM drizzle.__drizzle_migrations
      ORDER BY id
    `;
    assert.deepEqual(
      history.map(({ id, name }) => ({ id, name })),
      [
        { id: 1, name: '20260712000000_legacy_gap_first' },
        { id: 2, name: '20260712000002_legacy_gap_third' },
        { id: 3, name: '20260712000001_legacy_gap_second' },
      ],
    );
    assert.deepEqual(
      history.map(({ hash }) => hash),
      [
        firstMigration.hash,
        thirdMigration.hash,
        readMigrationFiles({ migrationsFolder: migrations })[1]?.hash,
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
      ['migration_legacy_gap_first', 'migration_legacy_gap_second', 'migration_legacy_gap_third'],
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('legacy history의 timestamp/hash 모호한 mapping은 승격 전에 거부한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_legacy_ambiguous_a',
      sql: 'SELECT 1;',
    },
    {
      name: '20260712000000_legacy_ambiguous_b',
      sql: 'SELECT 1;',
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
      VALUES (${firstMigration.hash}, ${firstMigration.folderMillis + 123})
    `;

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /ambiguous.*mapping/,
    );
    assert.deepEqual(await migrationHistoryColumns(control), [
      { columnName: 'id' },
      { columnName: 'hash' },
      { columnName: 'created_at' },
    ]);
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('legacy history의 duplicate mapping은 승격 전에 거부한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_legacy_duplicate_mapping_first',
      sql: 'CREATE TABLE migration_legacy_duplicate_mapping_first (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_legacy_duplicate_mapping_second',
      sql: 'CREATE TABLE migration_legacy_duplicate_mapping_second (id integer PRIMARY KEY);',
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
      VALUES
        (${firstMigration.hash}, ${firstMigration.folderMillis}),
        (${firstMigration.hash}, ${firstMigration.folderMillis})
    `;

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /duplicate migration/,
    );
    assert.deepEqual(await migrationHistoryColumns(control), [
      { columnName: 'id' },
      { columnName: 'hash' },
      { columnName: 'created_at' },
    ]);
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
      /unknown migration/,
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

    const [{ startedAt }] = await control<{ startedAt: Date }[]>`
      SELECT clock_timestamp() AS "startedAt"
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
    assert.ok(history[1]?.appliedAt);
    assert.ok(history[1].appliedAt.getTime() >= startedAt.getTime());
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

test('database owner 로그인으로 연결해 session_user와 current_user가 모두 owner다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const ownerRole = decodeURIComponent(new URL(databaseUrl).username);
  assert.equal(ownerRole, 'kosmo');
  const validMigrations = await migrationFolder([
    {
      name: '20260712000000_owner_first',
      sql: `
        CREATE TABLE migration_owner_sessions (
          migration_name text PRIMARY KEY,
          backend_pid integer NOT NULL,
          session_user_name name NOT NULL,
          current_user_name name NOT NULL
        );
        INSERT INTO migration_owner_sessions (
          migration_name,
          backend_pid,
          session_user_name,
          current_user_name
        )
        VALUES ('first', pg_backend_pid(), session_user, current_user);
      `,
    },
    {
      name: '20260712000001_owner_second',
      sql: `
        CREATE TABLE migration_owner_probe (id integer PRIMARY KEY);
        INSERT INTO migration_owner_sessions (
          migration_name,
          backend_pid,
          session_user_name,
          current_user_name
        )
        VALUES ('second', pg_backend_pid(), session_user, current_user);
      `,
    },
  ]);

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    await runDatabaseMigrations({
      databaseUrl,
      migrationsFolder: validMigrations,
    });

    const sessions = await control<
      {
        migrationName: string;
        backendPid: number;
        sessionUser: string;
        currentUser: string;
      }[]
    >`
      SELECT migration_name AS "migrationName",
        backend_pid AS "backendPid",
        session_user_name AS "sessionUser",
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
      sessions.map(({ sessionUser }) => sessionUser),
      [ownerRole, ownerRole],
    );
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

    await control.end({ timeout: 5 });
    await rm(validMigrations, { force: true, recursive: true });
  }
});

test('알림 계정 수신자로 마이그레이션하고 고아 프로필이면 전체 롤백한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrationName = '20261016042548_prod_1117_account_notifications';
  const notificationMigration = await readFile(
    new URL(`../../../drizzle/${migrationName}/migration.sql`, import.meta.url),
    'utf8',
  );
  const baseMigration = {
    name: '20260701000000_notification_base',
    sql: `
        CREATE TYPE "notification_kind" AS ENUM ('FOLLOW', 'OPERATIONAL');--> statement-breakpoint
        CREATE TYPE "account_profile_role" AS ENUM ('OWNER', 'MEMBER');--> statement-breakpoint
        CREATE TABLE "account" ("id" uuid PRIMARY KEY);--> statement-breakpoint
        CREATE TABLE "profile" ("id" uuid PRIMARY KEY);--> statement-breakpoint
        CREATE TABLE "account_profile" (
          "account_id" uuid NOT NULL REFERENCES "account"("id") ON DELETE CASCADE,
          "profile_id" uuid NOT NULL REFERENCES "profile"("id") ON DELETE CASCADE,
          "role" "account_profile_role" NOT NULL,
          PRIMARY KEY ("account_id", "profile_id")
        );--> statement-breakpoint
        CREATE TABLE "notification" (
          "id" uuid PRIMARY KEY,
          "recipient_profile_id" uuid REFERENCES "profile"("id") ON DELETE CASCADE,
          "recipient_account_id" uuid REFERENCES "account"("id") ON DELETE CASCADE,
          "kind" "notification_kind" NOT NULL,
          "source_id" uuid NOT NULL,
          "data" jsonb NOT NULL DEFAULT '{}',
          "created_at" timestamp with time zone NOT NULL DEFAULT now(),
          "read_at" timestamp with time zone,
          CONSTRAINT "notification_recipient_profile_id_kind_source_id_unique"
            UNIQUE ("recipient_profile_id", "kind", "source_id"),
          CONSTRAINT "notification_recipient_account_id_kind_source_id_unique"
            UNIQUE ("recipient_account_id", "kind", "source_id"),
          CONSTRAINT "notification_recipient_check"
            CHECK (("recipient_profile_id" IS NOT NULL) <> ("recipient_account_id" IS NOT NULL))
        );--> statement-breakpoint
        CREATE INDEX "notification_recipient_profile_id_id_index"
          ON "notification" ("recipient_profile_id", "id" DESC NULLS LAST);--> statement-breakpoint
        CREATE INDEX "notification_recipient_profile_id_index"
          ON "notification" ("recipient_profile_id") WHERE "read_at" IS NULL;--> statement-breakpoint
        CREATE INDEX "notification_kind_source_id_id_index"
          ON "notification" ("kind", "source_id", "id");
      `,
  };
  const baseMigrations = await migrationFolder(baseMigration.name, baseMigration.sql);
  const migrations = await migrationFolder([
    baseMigration,
    { name: migrationName, sql: notificationMigration },
  ]);

  const accountA = '10000000-0000-0000-0000-000000000001';
  const accountB = '10000000-0000-0000-0000-000000000002';
  const accountC = '10000000-0000-0000-0000-000000000003';
  const sharedProfile = '20000000-0000-0000-0000-000000000001';
  const uniqueProfile = '20000000-0000-0000-0000-000000000002';
  const sharedUnreadId = '30000000-0000-0000-0000-000000000001';
  const sharedReadId = '30000000-0000-0000-0000-000000000002';
  const uniqueMemberId = '30000000-0000-0000-0000-000000000003';
  const operationalId = '30000000-0000-0000-0000-000000000004';
  const sharedUnreadSource = '40000000-0000-0000-0000-000000000001';
  const sharedReadSource = '40000000-0000-0000-0000-000000000002';
  const uniqueSource = '40000000-0000-0000-0000-000000000003';
  const operationalSource = '40000000-0000-0000-0000-000000000004';
  const sharedCreatedAt = new Date('2026-10-10T00:00:00.000Z');
  const sharedReadAt = new Date('2026-10-11T00:00:00.000Z');

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: baseMigrations });
    await control.unsafe(`
      INSERT INTO "account" ("id") VALUES
        ('${accountA}'), ('${accountB}'), ('${accountC}');
      INSERT INTO "profile" ("id") VALUES
        ('${sharedProfile}'), ('${uniqueProfile}');
      INSERT INTO "account_profile" ("account_id", "profile_id", "role") VALUES
        ('${accountA}', '${sharedProfile}', 'MEMBER'),
        ('${accountB}', '${sharedProfile}', 'OWNER'),
        ('${accountC}', '${uniqueProfile}', 'MEMBER');
      INSERT INTO "notification" (
        "id", "recipient_profile_id", "recipient_account_id", "kind", "source_id", "data", "created_at", "read_at"
      ) VALUES
        ('${sharedUnreadId}', '${sharedProfile}', NULL, 'FOLLOW', '${sharedUnreadSource}', '{"text":"unread"}', '${sharedCreatedAt.toISOString()}', NULL),
        ('${sharedReadId}', '${sharedProfile}', NULL, 'FOLLOW', '${sharedReadSource}', '{"text":"read"}', '${sharedCreatedAt.toISOString()}', '${sharedReadAt.toISOString()}'),
        ('${uniqueMemberId}', '${uniqueProfile}', NULL, 'FOLLOW', '${uniqueSource}', '{"text":"unique"}', '${sharedCreatedAt.toISOString()}', NULL),
        ('${operationalId}', NULL, '${accountC}', 'OPERATIONAL', '${operationalSource}', '{"title":"Existing","href":"/"}', '${sharedCreatedAt.toISOString()}', NULL);
    `);

    type MigratedNotification = {
      id: string;
      profileId: string | null;
      accountId: string;
      kind: string;
      sourceId: string;
      data: Record<string, unknown>;
      createdAt: Date;
      readAt: Date | null;
    };
    const readNotifications = () =>
      control<MigratedNotification[]>`
        SELECT id::text AS id,
          recipient_profile_id::text AS "profileId",
          recipient_account_id::text AS "accountId",
          kind::text AS kind,
          source_id::text AS "sourceId",
          data,
          created_at AS "createdAt",
          read_at AS "readAt"
        FROM notification
        ORDER BY id
      `;

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });
    const notifications = await readNotifications();
    assert.equal(notifications.length, 6);

    const sharedUnread = notifications.filter(({ sourceId }) => sourceId === sharedUnreadSource);
    assert.equal(sharedUnread.length, 2);
    assert.deepEqual(
      sharedUnread.map(({ accountId }) => accountId).sort(),
      [accountA, accountB].sort(),
    );
    const originalSharedUnread = sharedUnread.find(({ id }) => id === sharedUnreadId);
    assert.equal(originalSharedUnread?.accountId, accountB);
    assert.equal(originalSharedUnread?.profileId, sharedProfile);
    assert.equal(originalSharedUnread?.createdAt.getTime(), sharedCreatedAt.getTime());
    assert.equal(originalSharedUnread?.readAt, null);
    assert.deepEqual(originalSharedUnread?.data, { text: 'unread' });
    const copiedSharedUnread = sharedUnread.find(({ id }) => id !== sharedUnreadId);
    assert.equal(copiedSharedUnread?.accountId, accountA);
    assert.equal(copiedSharedUnread?.profileId, sharedProfile);
    assert.equal(copiedSharedUnread?.createdAt.getTime(), sharedCreatedAt.getTime());
    assert.equal(copiedSharedUnread?.readAt, null);
    assert.deepEqual(copiedSharedUnread?.data, { text: 'unread' });

    const sharedRead = notifications.filter(({ sourceId }) => sourceId === sharedReadSource);
    assert.equal(sharedRead.length, 2);
    assert.deepEqual(
      sharedRead.map(({ accountId }) => accountId).sort(),
      [accountA, accountB].sort(),
    );
    assert.ok(
      sharedRead.every(({ createdAt }) => createdAt.getTime() === sharedCreatedAt.getTime()),
    );
    assert.ok(sharedRead.every(({ readAt }) => readAt?.getTime() === sharedReadAt.getTime()));
    assert.ok(
      sharedRead.some(({ id, accountId }) => id === sharedReadId && accountId === accountB),
    );

    const uniqueMember = notifications.filter(({ sourceId }) => sourceId === uniqueSource);
    assert.equal(uniqueMember.length, 1);
    assert.equal(uniqueMember[0]?.id, uniqueMemberId);
    assert.equal(uniqueMember[0]?.profileId, uniqueProfile);
    assert.equal(uniqueMember[0]?.accountId, accountC);

    const operational = notifications.filter(({ kind }) => kind === 'OPERATIONAL');
    assert.equal(operational.length, 1);
    assert.equal(operational[0]?.id, operationalId);
    assert.equal(operational[0]?.profileId, null);
    assert.equal(operational[0]?.accountId, accountC);
    assert.deepEqual(operational[0]?.data, { title: 'Existing', href: '/' });

    const [{ isNullable }] = await control<{ isNullable: string }[]>`
      SELECT is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification'
        AND column_name = 'recipient_account_id'
    `;
    assert.equal(isNullable, 'NO');

    const [{ definition }] = await control<{ definition: string }[]>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public.notification_recipient_snapshot'::regclass
        AND contype = 'p'
    `;
    assert.match(definition, /PRIMARY KEY \(kind, source_id\)/);

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });
    assert.equal((await readNotifications()).length, 6);
    const [{ appliedCount }] = await control<{ appliedCount: number }[]>`
      SELECT count(*)::int AS "appliedCount" FROM drizzle.__drizzle_migrations
    `;
    assert.equal(appliedCount, 2);

    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: baseMigrations });
    await control.unsafe(`
      INSERT INTO "profile" ("id") VALUES ('${sharedProfile}');
      INSERT INTO "notification" (
        "id", "recipient_profile_id", "recipient_account_id", "kind", "source_id", "data", "created_at", "read_at"
      ) VALUES (
        '${sharedUnreadId}', '${sharedProfile}', NULL, 'FOLLOW', '${sharedUnreadSource}', '{"text":"orphan"}', '${sharedCreatedAt.toISOString()}', NULL
      );
    `);

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      /no linked account.*Add an account_profile membership/i,
    );
    const [{ tableName }] = await control<{ tableName: string | null }[]>`
      SELECT to_regclass('public.notification_recipient_snapshot')::text AS "tableName"
    `;
    assert.equal(tableName, null);
    const [{ isNullable: nullableAfterFailure }] = await control<{ isNullable: string }[]>`
      SELECT is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification'
        AND column_name = 'recipient_account_id'
    `;
    assert.equal(nullableAfterFailure, 'YES');
    const [{ recipientAccountId, rowCount }] = await control<
      { recipientAccountId: string | null; rowCount: number }[]
    >`
      SELECT recipient_account_id::text AS "recipientAccountId", count(*)::int AS "rowCount"
      FROM notification
      WHERE id = ${sharedUnreadId}
      GROUP BY recipient_account_id
    `;
    assert.equal(recipientAccountId, null);
    assert.equal(rowCount, 1);
    const [{ oldConstraintCount }] = await control<{ oldConstraintCount: number }[]>`
      SELECT count(*)::int AS "oldConstraintCount"
      FROM pg_constraint
      WHERE conrelid = 'public.notification'::regclass
        AND conname = 'notification_recipient_check'
    `;
    assert.equal(oldConstraintCount, 1);
    const [{ appliedAfterFailure }] = await control<{ appliedAfterFailure: number }[]>`
      SELECT count(*)::int AS "appliedAfterFailure" FROM drizzle.__drizzle_migrations
    `;
    assert.equal(appliedAfterFailure, 1);
  } finally {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await control.end({ timeout: 5 });
    await rm(baseMigrations, { force: true, recursive: true });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('현재 마이그레이션 이력을 빈 데이터베이스에 적용한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const configuredMigrations = readMigrationFiles({ migrationsFolder: drizzleConfig.out });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    assert.ok(configuredMigrations.length > 0);
    await runDatabaseMigrations({ databaseUrl });
    const [{ count: appliedCount }] = await control<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    assert.equal(appliedCount, configuredMigrations.length);

    await runDatabaseMigrations({ databaseUrl });
    const [{ count: reappliedCount }] = await control<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    assert.equal(reappliedCount, appliedCount);
  } finally {
    await control.end({ timeout: 5 });
  }
});
