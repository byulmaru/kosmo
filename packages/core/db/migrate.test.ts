import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { asc, eq, sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { fraciBinary } from 'fraci';
import postgres from 'postgres';
import drizzleConfig from '../drizzle.config';
import { migrationLock, runDatabaseMigrations } from './migrate';
import { ProfilePinnedPosts } from './tables';
import type { FractionalIndexOf } from 'fraci';

const databaseUrl = process.env.DATABASE_URL;

const preBackfillProfilePinOrderKey = sql<Buffer>`coalesce(${ProfilePinnedPosts.orderKey}, decode('94', 'hex') || int4send(coalesce(${ProfilePinnedPosts.position}, 2147483647)) || case when ${ProfilePinnedPosts.position} is null then decode('01', 'hex') else decode('00', 'hex') end || uuid_send(${ProfilePinnedPosts.id}))`;

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

const profilePinBackfillName = '20261028152656_prod1253_profile_pin_order_backfill';
const profilePinBaseMigration: MigrationFixture = {
  name: '20261028152655_prod1253_profile_pin_order_backfill_base',
  sql: `
    CREATE TABLE profile_pinned_post (
      id uuid PRIMARY KEY,
      profile_id uuid NOT NULL,
      post_id uuid NOT NULL,
      position integer,
      order_key bytea,
      UNIQUE (profile_id, post_id),
      UNIQUE (profile_id, position),
      UNIQUE (profile_id, order_key)
    );
  `,
};

async function profilePinMigrationFolders() {
  const migrationSql = await readFile(
    new URL(`../../../drizzle/${profilePinBackfillName}/migration.sql`, import.meta.url),
    'utf8',
  );
  return [
    await migrationFolder(profilePinBaseMigration.name, profilePinBaseMigration.sql),
    await migrationFolder([
      profilePinBaseMigration,
      { name: profilePinBackfillName, sql: migrationSql },
    ]),
  ] as const;
}

test('알림 Expand 뒤 구버전 Profile 알림 쓰기가 유지된다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const indexPrepMigrationName = '20261017090000_prod_1117_notification_index_prep';
  const expandMigrationName = '20261017090100_prod_1117_notification_expand';
  const indexPrepMigration = await readFile(
    new URL(`../../../drizzle/${indexPrepMigrationName}/migration.sql`, import.meta.url),
    'utf8',
  );
  const expandMigration = await readFile(
    new URL(`../../../drizzle/${expandMigrationName}/migration.sql`, import.meta.url),
    'utf8',
  );
  const baseMigration = {
    name: '20261016040000_notification_expand_compatibility_base',
    sql: `
      CREATE TABLE account (id uuid PRIMARY KEY);
      CREATE TABLE profile (id uuid PRIMARY KEY);
      CREATE TABLE post (id uuid PRIMARY KEY);
      CREATE TABLE profile_follow_request (id uuid PRIMARY KEY);
      CREATE TABLE profile_follow (id uuid PRIMARY KEY);
      CREATE TABLE reaction (id uuid PRIMARY KEY);
      CREATE TABLE notification (
        id uuid PRIMARY KEY,
        recipient_profile_id uuid REFERENCES profile(id) ON DELETE CASCADE,
        recipient_account_id uuid REFERENCES account(id) ON DELETE CASCADE,
        kind text NOT NULL,
        source_id uuid NOT NULL,
        data jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        read_at timestamptz,
        CONSTRAINT notification_recipient_check CHECK (
          (recipient_profile_id IS NOT NULL) <> (recipient_account_id IS NOT NULL)
        ),
        CONSTRAINT notification_recipient_profile_id_kind_source_id_unique
          UNIQUE (recipient_profile_id, kind, source_id),
        CONSTRAINT notification_recipient_account_id_kind_source_id_unique
          UNIQUE (recipient_account_id, kind, source_id)
      );
      CREATE INDEX notification_recipient_profile_id_id_index
        ON notification (recipient_profile_id, id DESC);
      CREATE INDEX notification_recipient_profile_id_index
        ON notification (recipient_profile_id) WHERE read_at IS NULL;
      CREATE INDEX notification_kind_source_id_id_index
        ON notification (kind, source_id, id);
    `,
  };
  const baseMigrations = await migrationFolder(baseMigration.name, baseMigration.sql);
  const expandedMigrations = await migrationFolder([
    baseMigration,
    { name: indexPrepMigrationName, sql: indexPrepMigration },
    { name: expandMigrationName, sql: expandMigration },
  ]);

  const accountId = '10000000-0000-0000-0000-000000000001';
  const profileId = '20000000-0000-0000-0000-000000000001';
  const firstNotificationId = '30000000-0000-0000-0000-000000000001';
  const duplicateNotificationId = '30000000-0000-0000-0000-000000000002';
  const operationalNotificationId = '30000000-0000-0000-0000-000000000003';
  const operationalDuplicateId = '30000000-0000-0000-0000-000000000004';
  const accountBoundNotificationId = '30000000-0000-0000-0000-000000000005';
  const profileSourceId = '40000000-0000-0000-0000-000000000001';
  const operationalSourceId = '40000000-0000-0000-0000-000000000002';
  const accountBoundSourceId = '40000000-0000-0000-0000-000000000003';
  const actorAccountId = '10000000-0000-0000-0000-000000000002';
  const missingActorAccountId = '10000000-0000-0000-0000-000000000003';
  const legacySourceRows = [
    {
      tableName: 'post',
      id: '50000000-0000-0000-0000-000000000001',
      actorAccountConstraint: 'post_actor_account_id_account_id_fkey',
    },
    {
      tableName: 'profile_follow_request',
      id: '50000000-0000-0000-0000-000000000002',
      actorAccountConstraint: 'profile_follow_request_actor_account_id_account_id_fkey',
    },
    {
      tableName: 'profile_follow',
      id: '50000000-0000-0000-0000-000000000003',
      actorAccountConstraint: 'profile_follow_actor_account_id_account_id_fkey',
    },
    {
      tableName: 'reaction',
      id: '50000000-0000-0000-0000-000000000004',
      actorAccountConstraint: 'reaction_actor_account_id_account_id_fkey',
    },
  ] as const;

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: baseMigrations });
    await control`INSERT INTO account (id) VALUES (${accountId})`;
    await control`INSERT INTO account (id) VALUES (${actorAccountId})`;
    await control`INSERT INTO profile (id) VALUES (${profileId})`;
    for (const { tableName, id } of legacySourceRows) {
      await control.unsafe(`INSERT INTO "${tableName}" (id) VALUES ($1)`, [id]);
    }
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: expandedMigrations });

    const expectedActorForeignKeys = legacySourceRows
      .map(
        ({ tableName, actorAccountConstraint }, index) =>
          `(${index}, '${tableName}'::regclass, '${actorAccountConstraint}')`,
      )
      .join(', ');
    const actorForeignKeys = Array.from(
      await control.unsafe<{ constraintName: string; isValidated: boolean }[]>(
        `WITH expected_actor_foreign_keys (ordinal, table_id, constraint_name) AS (
           VALUES ${expectedActorForeignKeys}
         )
         SELECT actual.conname AS "constraintName", actual.convalidated AS "isValidated"
         FROM expected_actor_foreign_keys AS expected
         JOIN pg_constraint AS actual
           ON actual.conrelid = expected.table_id
           AND actual.conname = expected.constraint_name
           AND actual.contype = 'f'
         ORDER BY expected.ordinal`,
      ),
    );
    assert.deepEqual(
      actorForeignKeys,
      legacySourceRows.map(({ actorAccountConstraint }) => ({
        constraintName: actorAccountConstraint,
        isValidated: true,
      })),
    );

    for (const { tableName, id, actorAccountConstraint } of legacySourceRows) {
      const table = `"${tableName}"`;
      const legacyRows = Array.from(
        await control.unsafe<{ id: string; actorAccountId: string | null }[]>(
          `SELECT id::text AS id, actor_account_id::text AS "actorAccountId"
           FROM ${table}
           WHERE id = $1`,
          [id],
        ),
      );
      assert.deepEqual(legacyRows, [{ id, actorAccountId: null }]);

      const linkedActorRows = Array.from(
        await control.unsafe<{ actorAccountId: string | null }[]>(
          `UPDATE ${table}
           SET actor_account_id = $1
           WHERE id = $2
           RETURNING actor_account_id::text AS "actorAccountId"`,
          [actorAccountId, id],
        ),
      );
      assert.deepEqual(linkedActorRows, [{ actorAccountId }]);

      await assert.rejects(
        control.unsafe(
          `UPDATE ${table}
           SET actor_account_id = $1
           WHERE id = $2`,
          [missingActorAccountId, id],
        ),
        (error: unknown) => {
          const postgresError = error as { code?: string; constraint_name?: string };
          return (
            postgresError.code === '23503' &&
            postgresError.constraint_name === actorAccountConstraint
          );
        },
      );
    }

    const insertProfileNotification = (id: string) =>
      control<{ id: string }[]>`
        INSERT INTO notification (id, recipient_profile_id, kind, source_id, data)
        VALUES (${id}, ${profileId}, 'FOLLOW', ${profileSourceId}, '{}')
        ON CONFLICT (recipient_profile_id, kind, source_id) DO NOTHING
        RETURNING id::text AS id
      `;
    assert.deepEqual(Array.from(await insertProfileNotification(firstNotificationId)), [
      { id: firstNotificationId },
    ]);
    assert.deepEqual(Array.from(await insertProfileNotification(duplicateNotificationId)), []);

    const [{ profileNotificationCount }] = await control<{ profileNotificationCount: number }[]>`
      SELECT count(*)::int AS "profileNotificationCount"
      FROM notification
      WHERE recipient_profile_id = ${profileId}
        AND recipient_account_id IS NULL
        AND kind = 'FOLLOW'
        AND source_id = ${profileSourceId}
    `;
    assert.equal(profileNotificationCount, 1);

    const [{ accountBoundId, accountBoundProfileId, accountBoundRecipientId }] = await control<
      {
        accountBoundId: string;
        accountBoundProfileId: string | null;
        accountBoundRecipientId: string | null;
      }[]
    >`
      INSERT INTO notification (
        id, recipient_profile_id, recipient_account_id, kind, source_id, data
      ) VALUES (
        ${accountBoundNotificationId}, ${profileId}, ${accountId}, 'FOLLOW',
        ${accountBoundSourceId}, '{}'
      )
      RETURNING id::text AS "accountBoundId",
        recipient_profile_id::text AS "accountBoundProfileId",
        recipient_account_id::text AS "accountBoundRecipientId"
    `;
    assert.deepEqual(
      { accountBoundId, accountBoundProfileId, accountBoundRecipientId },
      {
        accountBoundId: accountBoundNotificationId,
        accountBoundProfileId: profileId,
        accountBoundRecipientId: accountId,
      },
    );

    const [{ id, recipientProfileId }] = await control<
      { id: string; recipientProfileId: string | null }[]
    >`
      INSERT INTO notification (
        id, recipient_account_id, kind, source_id, data
      ) VALUES (
        ${operationalNotificationId}, ${accountId}, 'OPERATIONAL', ${operationalSourceId},
        '{"title":"Maintenance","href":"/"}'
      )
      RETURNING id::text AS id, recipient_profile_id::text AS "recipientProfileId"
    `;
    assert.equal(id, operationalNotificationId);
    assert.equal(recipientProfileId, null);
    await assert.rejects(
      control`
        INSERT INTO notification (
          id, recipient_account_id, kind, source_id, data
        ) VALUES (
          ${operationalDuplicateId}, ${accountId}, 'OPERATIONAL', ${operationalSourceId},
          '{"title":"Maintenance","href":"/"}'
        )
      `,
      (error: unknown) => (error as { code?: string }).code === '23505',
    );

    await control`DELETE FROM account WHERE id = ${actorAccountId}`;
    for (const { tableName, id } of legacySourceRows) {
      const remainingRows = Array.from(
        await control.unsafe<{ id: string; actorAccountId: string | null }[]>(
          `SELECT id::text AS id, actor_account_id::text AS "actorAccountId"
           FROM "${tableName}"
           WHERE id = $1`,
          [id],
        ),
      );
      assert.deepEqual(remainingRows, [{ id, actorAccountId: null }]);
    }
  } finally {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await control.end({ timeout: 5 });
    await rm(baseMigrations, { force: true, recursive: true });
    await rm(expandedMigrations, { force: true, recursive: true });
  }
});

test('고정글 순서 키 Backfill은 기존 유효 순서와 키를 보존하고 구버전 NULL 쓰기를 허용한다', async () => {
  const [baseMigrations, backfillMigrations] = await profilePinMigrationFolders();
  const control = postgres(databaseUrl, { max: 1 });
  const pinDb = drizzle({ client: control, schema: { ProfilePinnedPosts } });
  const localProfileId = '10000000-0000-7000-8000-000000000001';
  const remoteProfileId = '10000000-0000-7000-8000-000000000002';
  const localNullId = '90000000-0000-7000-8000-000000000002';
  const localExistingKeyId = '90000000-0000-7000-8000-000000000003';
  const localNullAfterId = '90000000-0000-7000-8000-000000000004';
  const remoteZeroId = '90000000-0000-7000-8000-000000000011';
  const remoteMaxId = '90000000-0000-7000-8000-000000000012';
  const remoteExistingKeyId = '90000000-0000-7000-8000-000000000013';
  const remoteNullId = '90000000-0000-7000-8000-000000000014';
  const existingKey = Buffer.from('947fffffff0100000000000000000000000000000001', 'hex');
  const profilePinKeys = fraciBinary();
  const readEffectivePins = (profileId: string) =>
    pinDb
      .select({ id: ProfilePinnedPosts.id, key: preBackfillProfilePinOrderKey })
      .from(ProfilePinnedPosts)
      .where(eq(ProfilePinnedPosts.profileId, profileId))
      .orderBy(asc(preBackfillProfilePinOrderKey), asc(ProfilePinnedPosts.id));
  const readPhysicalPins = (profileId: string) =>
    pinDb
      .select({ id: ProfilePinnedPosts.id, key: ProfilePinnedPosts.orderKey })
      .from(ProfilePinnedPosts)
      .where(eq(ProfilePinnedPosts.profileId, profileId))
      .orderBy(asc(ProfilePinnedPosts.orderKey), asc(ProfilePinnedPosts.id));
  const readStoredPins = () =>
    control<
      {
        id: string;
        profileId: string;
        postId: string;
        position: number | null;
        key: Buffer | null;
      }[]
    >`
      SELECT id::text AS id, profile_id::text AS "profileId", post_id::text AS "postId",
        position, order_key AS key
      FROM profile_pinned_post
      ORDER BY profile_id, id
    `;

  try {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: baseMigrations });
    await control`
      INSERT INTO profile_pinned_post (id, profile_id, post_id, position, order_key) VALUES
        (${localNullId}, ${localProfileId}, ${localNullId}, null, null),
        (${localExistingKeyId}, ${localProfileId}, ${localExistingKeyId}, null, ${existingKey}),
        (${localNullAfterId}, ${localProfileId}, ${localNullAfterId}, null, null),
        (${remoteZeroId}, ${remoteProfileId}, ${remoteZeroId}, 0, null),
        (${remoteMaxId}, ${remoteProfileId}, ${remoteMaxId}, 2147483647, null),
        (${remoteExistingKeyId}, ${remoteProfileId}, ${remoteExistingKeyId}, 1, ${existingKey}),
        (${remoteNullId}, ${remoteProfileId}, ${remoteNullId}, null, null)
    `;

    const localBefore = await readEffectivePins(localProfileId);
    const remoteBefore = await readEffectivePins(remoteProfileId);
    assert.deepEqual(
      localBefore.map(({ id }) => id),
      [localExistingKeyId, localNullId, localNullAfterId],
    );
    assert.deepEqual(
      remoteBefore.map(({ id }) => id),
      [remoteZeroId, remoteMaxId, remoteExistingKeyId, remoteNullId],
    );
    const effectiveKeys = new Map(
      [...localBefore, ...remoteBefore].map(({ id, key }) => [id, key]),
    );

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: backfillMigrations });

    const localAfter = await readPhysicalPins(localProfileId);
    const remoteAfter = await readPhysicalPins(remoteProfileId);
    assert.deepEqual(
      localAfter.map(({ id }) => id),
      localBefore.map(({ id }) => id),
    );
    assert.deepEqual(
      remoteAfter.map(({ id }) => id),
      remoteBefore.map(({ id }) => id),
    );
    for (const { id, key } of [...localAfter, ...remoteAfter]) {
      assert.ok(Buffer.isBuffer(key));
      assert.deepEqual(key, effectiveKeys.get(id));
      const nextKey = profilePinKeys
        .generateKeyBetween(new Uint8Array(key) as FractionalIndexOf<typeof profilePinKeys>, null)
        .next().value;
      assert.ok(Buffer.compare(key, Buffer.from(nextKey)) < 0);
    }

    const backfill = readMigrationFiles({ migrationsFolder: backfillMigrations }).find(
      ({ name }) => name === profilePinBackfillName,
    );
    assert.ok(backfill);
    const beforeRerun = Array.from(await readStoredPins());
    await control.begin(async (transaction) => {
      for (const statement of backfill.sql) {
        await transaction.unsafe(statement);
      }
    });
    assert.deepEqual(Array.from(await readStoredPins()), beforeRerun);

    const oldWriterId = '90000000-0000-7000-8000-000000000015';
    await control`
      INSERT INTO profile_pinned_post (id, profile_id, post_id, position)
      VALUES (${oldWriterId}, ${localProfileId}, ${oldWriterId}, null)
    `;
    const [oldWriterPin] = await control<{ key: Buffer | null }[]>`
      SELECT order_key AS key FROM profile_pinned_post WHERE id = ${oldWriterId}
    `;
    assert.equal(oldWriterPin?.key, null);
  } finally {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await control.end({ timeout: 5 });
    await rm(baseMigrations, { force: true, recursive: true });
    await rm(backfillMigrations, { force: true, recursive: true });
  }
});

test('고정글 순서 키 Backfill 충돌은 행과 migration history를 함께 롤백한다', async () => {
  const [baseMigrations, backfillMigrations] = await profilePinMigrationFolders();
  const control = postgres(databaseUrl, { max: 1 });
  const pinDb = drizzle({ client: control, schema: { ProfilePinnedPosts } });
  const profileId = '10000000-0000-7000-8000-000000000003';
  const nullId = '90000000-0000-7000-8000-000000000021';
  const collisionId = '90000000-0000-7000-8000-000000000022';

  try {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: baseMigrations });
    await control`
      INSERT INTO profile_pinned_post (id, profile_id, post_id, position)
      VALUES (${nullId}, ${profileId}, ${nullId}, null)
    `;
    const [nullPin] = await pinDb
      .select({ key: preBackfillProfilePinOrderKey })
      .from(ProfilePinnedPosts)
      .where(eq(ProfilePinnedPosts.id, nullId));
    assert.ok(nullPin);
    await control`
      INSERT INTO profile_pinned_post (id, profile_id, post_id, position, order_key)
      VALUES (${collisionId}, ${profileId}, ${collisionId}, 0, ${nullPin.key})
    `;
    const rowsBefore = Array.from(
      await control<{ id: string; position: number | null; key: Buffer | null }[]>`
        SELECT id::text AS id, position, order_key AS key
        FROM profile_pinned_post
        ORDER BY id
      `,
    );

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: backfillMigrations }),
      (error: unknown) => (error as { code?: string }).code === '23505',
    );
    const rowsAfter = Array.from(
      await control<{ id: string; position: number | null; key: Buffer | null }[]>`
        SELECT id::text AS id, position, order_key AS key
        FROM profile_pinned_post
        ORDER BY id
      `,
    );
    assert.deepEqual(rowsAfter, rowsBefore);
    const history = Array.from(
      await control<{ name: string | null }[]>`
        SELECT name FROM drizzle.__drizzle_migrations ORDER BY id
      `,
    );
    assert.deepEqual(
      history.map(({ name }) => name),
      [profilePinBaseMigration.name],
    );
  } finally {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await control.end({ timeout: 5 });
    await rm(baseMigrations, { force: true, recursive: true });
    await rm(backfillMigrations, { force: true, recursive: true });
  }
});

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

test('비트랜잭션 파일에서 CREATE INDEX CONCURRENTLY를 적용하고 재실행을 건너뛴다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migration = {
    name: '20260712000000_concurrent_index',
    sql: `-- kosmo:transaction off
CREATE TABLE migration_concurrent_index (id integer PRIMARY KEY);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY migration_concurrent_index_idx ON migration_concurrent_index (id);`,
  };
  const migrations = await migrationFolder([migration]);
  const [parsedMigration] = readMigrationFiles({ migrationsFolder: migrations });

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    const [{ isValid }] = await control<{ isValid: boolean }[]>`
      SELECT indisvalid AS "isValid"
      FROM pg_index
      WHERE indexrelid = 'public.migration_concurrent_index_idx'::regclass
    `;
    assert.equal(isValid, true);
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    assert.deepEqual(
      Array.from(
        await control<{ name: string; hash: string }[]>`
          SELECT name, hash
          FROM drizzle.__drizzle_migrations
          ORDER BY id
        `,
      ),
      [{ name: migration.name, hash: parsedMigration.hash }],
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('비트랜잭션 파일의 일부 DDL 실패를 수동 정리한 뒤 재시도한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const failedMigration = {
    name: '20260712000000_nontransactional_partial',
    sql: `-- kosmo:transaction off
CREATE TABLE migration_nontransactional_partial (id integer PRIMARY KEY);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY migration_nontransactional_partial_idx
  ON migration_nontransactional_partial (id);
--> statement-breakpoint
SELECT * FROM migration_nontransactional_missing;`,
  };
  const laterMigration = {
    name: '20260712000001_nontransactional_later',
    sql: 'CREATE TABLE migration_nontransactional_later (id integer PRIMARY KEY);',
  };
  const migrations = await migrationFolder([failedMigration, laterMigration]);

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, new RegExp(failedMigration.name));
        assert.match(error.message, /partially persisted/i);
        assert.match(error.message, /documented recovery before retrying/i);
        assert.match(
          String((error as Error & { cause?: unknown }).cause),
          /migration_nontransactional_missing/,
        );
        return true;
      },
    );

    assert.deepEqual(
      Array.from(
        await control<{ objectName: string | null }[]>`
          SELECT to_regclass(object_name)::text AS "objectName"
          FROM unnest(ARRAY[
            'public.migration_nontransactional_partial',
            'public.migration_nontransactional_partial_idx'
          ]) AS object_name
        `,
      ).map(({ objectName }) => objectName),
      ['migration_nontransactional_partial', 'migration_nontransactional_partial_idx'],
    );
    assert.equal(
      (
        await control<{ count: number }[]>`
          SELECT count(*)::int AS count
          FROM drizzle.__drizzle_migrations
          WHERE name = ${failedMigration.name}
        `
      )[0]?.count,
      0,
    );
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_nontransactional_later')::text AS "tableName"
        `
      )[0]?.tableName,
      null,
    );

    await control.unsafe('DROP INDEX CONCURRENTLY migration_nontransactional_partial_idx');
    await control.unsafe('DROP TABLE migration_nontransactional_partial');
    await writeFile(
      join(migrations, failedMigration.name, 'migration.sql'),
      `-- kosmo:transaction off
CREATE TABLE migration_nontransactional_partial (id integer PRIMARY KEY);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY migration_nontransactional_partial_idx
  ON migration_nontransactional_partial (id);`,
    );

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations });

    const history = await control<{ name: string }[]>`
      SELECT name
      FROM drizzle.__drizzle_migrations
      ORDER BY id
    `;
    assert.deepEqual(
      Array.from(history).map(({ name }) => name),
      [failedMigration.name, laterMigration.name],
    );
    assert.equal(
      (
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass('public.migration_nontransactional_later')::text AS "tableName"
        `
      )[0]?.tableName,
      'migration_nontransactional_later',
    );
  } finally {
    await control.end({ timeout: 5 });
    await rm(migrations, { force: true, recursive: true });
  }
});

test('잘못된 transaction directive가 있으면 pending SQL을 실행하지 않는다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await migrationFolder([
    {
      name: '20260712000000_malformed_directive_before',
      sql: 'CREATE TABLE migration_malformed_directive_before (id integer PRIMARY KEY);',
    },
    {
      name: '20260712000001_malformed_directive_invalid',
      sql: `-- kosmo:transaction on
CREATE TABLE migration_malformed_directive_invalid (id integer PRIMARY KEY);`,
    },
    {
      name: '20260712000002_malformed_directive_after',
      sql: 'CREATE TABLE migration_malformed_directive_after (id integer PRIMARY KEY);',
    },
  ]);

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /20260712000001_malformed_directive_invalid/);
        assert.match(error.message, /-- kosmo:transaction off/);
        return true;
      },
    );

    assert.deepEqual(
      Array.from(
        await control<{ tableName: string | null }[]>`
          SELECT to_regclass(table_name)::text AS "tableName"
          FROM unnest(ARRAY[
            'public.migration_malformed_directive_before',
            'public.migration_malformed_directive_invalid',
            'public.migration_malformed_directive_after'
          ]) AS table_name
        `,
      ).map(({ tableName }) => tableName),
      [null, null, null],
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
