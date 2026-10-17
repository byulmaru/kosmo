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

const notificationBackfillBaseMigration: MigrationFixture = {
  name: '20261016040000_notification_expand_compatibility_base',
  sql: `
    CREATE TABLE account (id uuid PRIMARY KEY);
    CREATE TABLE profile (id uuid PRIMARY KEY);
    CREATE TABLE account_profile (
      account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
      profile_id uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
      role text NOT NULL,
      PRIMARY KEY (account_id, profile_id)
    );
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
  const baseMigration = notificationBackfillBaseMigration;
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

const notificationBackfillMigrationNames = {
  indexPrep: '20261017090000_prod_1117_notification_index_prep',
  expand: '20261017090100_prod_1117_notification_expand',
  guard: '20261017090200_prod_1128_notification_backfill_guard',
  backfill: '20261017090300_prod_1128_notification_backfill',
  later: '20261017090400_test_notification_backfill_later',
} as const;

async function notificationBackfillMigrationFolders() {
  const readMigration = (name: string) =>
    readFile(new URL('../../../drizzle/' + name + '/migration.sql', import.meta.url), 'utf8');
  const [indexPrepSql, expandSql, guardSql, backfillSql] = await Promise.all([
    readMigration(notificationBackfillMigrationNames.indexPrep),
    readMigration(notificationBackfillMigrationNames.expand),
    readMigration(notificationBackfillMigrationNames.guard),
    readMigration(notificationBackfillMigrationNames.backfill),
  ]);
  const indexPrep = { name: notificationBackfillMigrationNames.indexPrep, sql: indexPrepSql };
  const expand = { name: notificationBackfillMigrationNames.expand, sql: expandSql };
  const guard = { name: notificationBackfillMigrationNames.guard, sql: guardSql };
  const backfill = { name: notificationBackfillMigrationNames.backfill, sql: backfillSql };
  const later = {
    name: notificationBackfillMigrationNames.later,
    sql: 'CREATE TABLE notification_backfill_later (id integer PRIMARY KEY);',
  };
  const [base, expanded, guarded, backfilled, backfilledWithLater] = await Promise.all([
    migrationFolder([notificationBackfillBaseMigration]),
    migrationFolder([notificationBackfillBaseMigration, indexPrep, expand]),
    migrationFolder([notificationBackfillBaseMigration, indexPrep, expand, guard]),
    migrationFolder([notificationBackfillBaseMigration, indexPrep, expand, guard, backfill]),
    migrationFolder([notificationBackfillBaseMigration, indexPrep, expand, guard, backfill, later]),
  ]);

  return {
    base,
    expanded,
    guarded,
    backfilled,
    backfilledWithLater,
    backfillName: notificationBackfillMigrationNames.backfill,
  };
}

test('알림 Backfill은 legacy Profile 알림만 현재 Membership으로 fan-out한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await notificationBackfillMigrationFolders();
  const ownerAccountId = '10000000-0000-0000-0000-000000000003';
  const firstMemberAccountId = '10000000-0000-0000-0000-000000000001';
  const secondMemberAccountId = '10000000-0000-0000-0000-000000000002';
  const unlinkedAccountId = '10000000-0000-0000-0000-000000000004';
  const soleAccountId = '10000000-0000-0000-0000-000000000005';
  const sharedProfileId = '20000000-0000-0000-0000-000000000001';
  const unlinkedProfileId = '20000000-0000-0000-0000-000000000002';
  const soleProfileId = '20000000-0000-0000-0000-000000000003';
  const legacyUnreadId = '30000000-0000-0000-0000-000000000001';
  const legacyReadId = '30000000-0000-0000-0000-000000000002';
  const boundSharedId = '30000000-0000-0000-0000-000000000003';
  const boundUnlinkedId = '30000000-0000-0000-0000-000000000004';
  const operationalId = '30000000-0000-0000-0000-000000000005';
  const legacySoleId = '30000000-0000-0000-0000-000000000006';
  const legacyUnreadSourceId = '40000000-0000-0000-0000-000000000001';
  const legacyReadSourceId = '40000000-0000-0000-0000-000000000002';
  const boundSharedSourceId = '40000000-0000-0000-0000-000000000003';
  const boundUnlinkedSourceId = '40000000-0000-0000-0000-000000000004';
  const operationalSourceId = '40000000-0000-0000-0000-000000000005';
  const legacySoleSourceId = '40000000-0000-0000-0000-000000000006';
  const unreadCreatedAt = '2026-10-02T01:23:45.123456Z';
  const readCreatedAt = '2026-10-02T02:34:56.654321Z';
  const readAt = '2026-10-02T03:45:12.000123Z';
  const boundCreatedAt = '2026-10-02T04:56:23.456789Z';
  const unlinkedCreatedAt = '2026-10-02T05:07:34.567891Z';
  const operationalCreatedAt = '2026-10-02T06:18:45.678912Z';
  const soleCreatedAt = '2026-10-02T07:29:56.789123Z';
  const unreadData = { marker: 'legacy unread' };
  const readData = { marker: 'legacy read' };
  const soleData = { marker: 'legacy sole account' };

  type NotificationRow = {
    id: string;
    recipientProfileId: string | null;
    recipientAccountId: string | null;
    kind: string;
    sourceId: string;
    data: Record<string, unknown>;
    createdAt: string;
    readAt: string | null;
  };

  const selectSeedRows = () =>
    control<NotificationRow[]>`
      SELECT
        id::text AS id,
        recipient_profile_id::text AS "recipientProfileId",
        recipient_account_id::text AS "recipientAccountId",
        kind,
        source_id::text AS "sourceId",
        data,
        created_at::text AS "createdAt",
        read_at::text AS "readAt"
      FROM notification
      WHERE id IN (
        ${legacyUnreadId}, ${legacyReadId}, ${boundSharedId}, ${boundUnlinkedId},
        ${operationalId}, ${legacySoleId}
      )
      ORDER BY id
    `;

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.base });
    await control`
      INSERT INTO account (id) VALUES
        (${ownerAccountId}), (${firstMemberAccountId}), (${secondMemberAccountId}),
        (${unlinkedAccountId}), (${soleAccountId})
    `;
    await control`
      INSERT INTO profile (id) VALUES (${sharedProfileId}), (${unlinkedProfileId}), (${soleProfileId})
    `;
    await control`
      INSERT INTO account_profile (account_id, profile_id, role) VALUES
        (${ownerAccountId}, ${sharedProfileId}, 'OWNER'),
        (${firstMemberAccountId}, ${sharedProfileId}, 'MEMBER'),
        (${secondMemberAccountId}, ${sharedProfileId}, 'MEMBER'),
        (${soleAccountId}, ${soleProfileId}, 'OWNER')
    `;
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.expanded });

    await control`
      INSERT INTO notification (
        id, recipient_profile_id, recipient_account_id, kind, source_id, data, created_at, read_at
      ) VALUES
        (
          ${legacyUnreadId}, ${sharedProfileId}, NULL, 'FOLLOW', ${legacyUnreadSourceId},
          ${JSON.stringify(unreadData)}, ${unreadCreatedAt}::timestamptz, NULL
        ),
        (
          ${legacyReadId}, ${sharedProfileId}, NULL, 'MENTION', ${legacyReadSourceId},
          ${JSON.stringify(readData)}, ${readCreatedAt}::timestamptz, ${readAt}::timestamptz
        ),
        (
          ${boundSharedId}, ${sharedProfileId}, ${firstMemberAccountId}, 'REACTION',
          ${boundSharedSourceId}, '{"marker":"bound shared"}', ${boundCreatedAt}::timestamptz, NULL
        ),
        (
          ${boundUnlinkedId}, ${unlinkedProfileId}, ${unlinkedAccountId}, 'FOLLOW',
          ${boundUnlinkedSourceId}, '{"marker":"bound unlinked"}', ${unlinkedCreatedAt}::timestamptz, NULL
        ),
        (
          ${operationalId}, NULL, ${unlinkedAccountId}, 'OPERATIONAL', ${operationalSourceId},
          '{"title":"Maintenance","href":"/maintenance"}', ${operationalCreatedAt}::timestamptz, NULL
        ),
        (
          ${legacySoleId}, ${soleProfileId}, NULL, 'FOLLOW', ${legacySoleSourceId},
          ${JSON.stringify(soleData)}, ${soleCreatedAt}::timestamptz, NULL
        )
    `;

    const beforeRows = Array.from(await selectSeedRows());
    assert.equal(beforeRows.length, 6);

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.guarded });
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.backfilled });

    const afterSeedRows = Array.from(await selectSeedRows());
    const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
    const beforeLegacyUnread = beforeById.get(legacyUnreadId);
    const beforeLegacyRead = beforeById.get(legacyReadId);
    const beforeLegacySole = beforeById.get(legacySoleId);
    assert.ok(beforeLegacyUnread);
    assert.ok(beforeLegacyRead);
    assert.ok(beforeLegacySole);
    assert.deepEqual(
      afterSeedRows,
      beforeRows
        .map((row) =>
          row.id === legacySoleId
            ? { ...row, recipientAccountId: soleAccountId }
            : row.id === legacyUnreadId || row.id === legacyReadId
              ? { ...row, recipientAccountId: ownerAccountId }
              : row,
        )
        .sort((left, right) => left.id.localeCompare(right.id)),
    );

    const unchangedNotificationCounts = await control<{ sourceId: string; count: number }[]>`
      SELECT source_id::text AS "sourceId", count(*)::int AS count
      FROM notification
      WHERE source_id IN (${boundSharedSourceId}, ${boundUnlinkedSourceId}, ${operationalSourceId})
      GROUP BY source_id
      ORDER BY source_id
    `;
    assert.deepEqual(Array.from(unchangedNotificationCounts), [
      { sourceId: boundSharedSourceId, count: 1 },
      { sourceId: boundUnlinkedSourceId, count: 1 },
      { sourceId: operationalSourceId, count: 1 },
    ]);

    const sharedProfileRows = Array.from(
      await control<NotificationRow[]>`
      SELECT
        id::text AS id,
        recipient_profile_id::text AS "recipientProfileId",
        recipient_account_id::text AS "recipientAccountId",
        kind,
        source_id::text AS "sourceId",
        data,
        created_at::text AS "createdAt",
        read_at::text AS "readAt"
      FROM notification
      WHERE recipient_profile_id = ${sharedProfileId}
        AND source_id IN (${legacyUnreadSourceId}, ${legacyReadSourceId})
      ORDER BY source_id, recipient_account_id
    `,
    );
    const members = [ownerAccountId, firstMemberAccountId, secondMemberAccountId].sort();
    const cloneIds: string[] = [];

    for (const legacy of [beforeLegacyUnread, beforeLegacyRead]) {
      const fanout = sharedProfileRows.filter((row) => row.sourceId === legacy.sourceId);
      assert.equal(fanout.length, 3);
      assert.deepEqual(fanout.map(({ recipientAccountId }) => recipientAccountId).sort(), members);

      const original = fanout.find(({ id }) => id === legacy.id);
      assert.deepEqual(original, { ...legacy, recipientAccountId: ownerAccountId });

      const clones = fanout.filter(({ id }) => id !== legacy.id);
      assert.equal(clones.length, 2);
      for (const clone of clones) {
        assert.deepEqual(clone, {
          ...legacy,
          id: clone.id,
          recipientAccountId: clone.recipientAccountId,
        });
        assert.match(
          clone.id,
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        cloneIds.push(clone.id);
      }
    }
    assert.equal(new Set(cloneIds).size, 4);

    const soleProfileRows = Array.from(
      await control<NotificationRow[]>`
      SELECT
        id::text AS id,
        recipient_profile_id::text AS "recipientProfileId",
        recipient_account_id::text AS "recipientAccountId",
        kind,
        source_id::text AS "sourceId",
        data,
        created_at::text AS "createdAt",
        read_at::text AS "readAt"
      FROM notification
      WHERE recipient_profile_id = ${soleProfileId}
        AND source_id = ${legacySoleSourceId}
    `,
    );
    assert.deepEqual(soleProfileRows, [{ ...beforeLegacySole, recipientAccountId: soleAccountId }]);

    const profileConstraint = await control.unsafe(
      "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.notification'::regclass AND conname = 'notification_recipient_profile_id_kind_source_id_unique') AS exists",
    );
    assert.equal(profileConstraint[0]?.exists, false);
    const [{ recipientAccountNullable }] = await control<{ recipientAccountNullable: string }[]>`
      SELECT is_nullable AS "recipientAccountNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification'
        AND column_name = 'recipient_account_id'
    `;
    assert.equal(recipientAccountNullable, 'YES');

    const [{ oldProfileIdIndex }] = await control<{ oldProfileIdIndex: boolean }[]>`
      SELECT to_regclass('public.notification_recipient_profile_id_id_index') IS NOT NULL
        AS "oldProfileIdIndex"
    `;
    assert.equal(oldProfileIdIndex, true);
    const backfillHistory = await control.unsafe(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations WHERE name = '20261017090300_prod_1128_notification_backfill'",
    );
    assert.equal(backfillHistory[0]?.count, 1);
  } finally {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await control.end({ timeout: 5 });
    await Promise.all([
      rm(migrations.base, { force: true, recursive: true }),
      rm(migrations.expanded, { force: true, recursive: true }),
      rm(migrations.guarded, { force: true, recursive: true }),
      rm(migrations.backfilled, { force: true, recursive: true }),
      rm(migrations.backfilledWithLater, { force: true, recursive: true }),
    ]);
  }
});

test('Membership가 없는 legacy Notification이 committed guard 뒤 Backfill을 거부한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await notificationBackfillMigrationFolders();
  const profileId = '20000000-0000-0000-0000-000000000001';
  const notificationId = '30000000-0000-0000-0000-000000000001';
  const sourceId = '40000000-0000-0000-0000-000000000001';

  try {
    await control.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE;');
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.base });
    await control`INSERT INTO profile (id) VALUES (${profileId})`;
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.expanded });
    await control`
      INSERT INTO notification (id, recipient_profile_id, kind, source_id, data)
      VALUES (${notificationId}, ${profileId}, 'FOLLOW', ${sourceId}, '{"marker":"orphan"}')
    `;

    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.guarded });
    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.backfilledWithLater }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /20261017090300_prod_1128_notification_backfill/);
        const cause = (error as Error & { cause?: unknown }).cause;
        assert.ok(cause instanceof Error);
        const databaseError = cause as Error & { code?: string; hint?: string };
        assert.equal(databaseError.code, 'P0001');
        assert.match(databaseError.message, /Cannot backfill notification recipients/);
        assert.match(databaseError.hint ?? '', /Restore a current account_profile membership/);
        return true;
      },
    );

    const [row] = await control<
      { id: string; recipientAccountId: string | null; data: Record<string, unknown> }[]
    >`
      SELECT
        id::text AS id,
        recipient_account_id::text AS "recipientAccountId",
        data
      FROM notification
      WHERE id = ${notificationId}
    `;
    assert.deepEqual(row, {
      id: notificationId,
      recipientAccountId: null,
      data: { marker: 'orphan' },
    });
    assert.equal(
      (
        await control<{ count: number }[]>`
          SELECT count(*)::int AS count
          FROM notification
          WHERE recipient_profile_id = ${profileId}
        `
      )[0]?.count,
      1,
    );

    const [{ accountNullable, oldProfileConstraint, oldProfileIdIndex, backfillHistoryCount }] =
      await control<
        {
          accountNullable: string;
          oldProfileConstraint: boolean;
          oldProfileIdIndex: boolean;
          backfillHistoryCount: number;
        }[]
      >`
        SELECT
          (
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'notification'
              AND column_name = 'recipient_account_id'
          ) AS "accountNullable",
          EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.notification'::regclass
              AND conname = 'notification_recipient_profile_id_kind_source_id_unique'
          ) AS "oldProfileConstraint",
          to_regclass('public.notification_recipient_profile_id_id_index') IS NOT NULL
            AS "oldProfileIdIndex",
          (
            SELECT count(*)::int
            FROM drizzle.__drizzle_migrations
            WHERE name = ${migrations.backfillName}
          ) AS "backfillHistoryCount"
      `;
    assert.equal(accountNullable, 'YES');
    assert.equal(oldProfileConstraint, false);
    assert.equal(oldProfileIdIndex, true);
    assert.equal(backfillHistoryCount, 0);
    const guardHistory = await control.unsafe(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations WHERE name = '20261017090200_prod_1128_notification_backfill_guard'",
    );
    const laterTable = await control.unsafe(
      "SELECT to_regclass('public.notification_backfill_later') IS NOT NULL AS exists",
    );
    assert.equal(guardHistory[0]?.count, 1);
    assert.equal(laterTable[0]?.exists, false);
  } finally {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await control.end({ timeout: 5 });
    await Promise.all([
      rm(migrations.base, { force: true, recursive: true }),
      rm(migrations.expanded, { force: true, recursive: true }),
      rm(migrations.guarded, { force: true, recursive: true }),
      rm(migrations.backfilled, { force: true, recursive: true }),
      rm(migrations.backfilledWithLater, { force: true, recursive: true }),
    ]);
  }
});

test('알림 Backfill은 OWNER가 없으면 가장 작은 Account ID를 원본에 남긴다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await notificationBackfillMigrationFolders();

  try {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.base });
    await control.unsafe(`
      INSERT INTO account (id) VALUES
        ('10000000-0000-0000-0000-000000000001'),
        ('10000000-0000-0000-0000-000000000002');
      INSERT INTO profile (id)
      VALUES ('20000000-0000-0000-0000-000000000001');
      INSERT INTO account_profile (account_id, profile_id, role) VALUES
        ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'MEMBER'),
        ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'MEMBER');
    `);
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.expanded });
    await control.unsafe(`
      INSERT INTO notification (
        id, recipient_profile_id, kind, source_id, data, created_at, read_at
      ) VALUES (
        '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        'FOLLOW',
        '40000000-0000-0000-0000-000000000001',
        '{"marker":"membership tie"}',
        '2026-10-02T01:23:45.123456Z',
        '2026-10-02T03:45:12.000123Z'
      );
    `);
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.guarded });
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.backfilled });

    const rows = Array.from(
      await control.unsafe(`
      SELECT
        id::text AS id,
        recipient_account_id::text AS account,
        data,
        created_at::text AS created,
        read_at::text AS read
      FROM notification
      ORDER BY recipient_account_id
    `),
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row: { account: string }) => row.account),
      ['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'],
    );
    assert.equal(rows[0]?.id, '30000000-0000-0000-0000-000000000001');
    assert.deepEqual(rows[0]?.data, { marker: 'membership tie' });
    assert.equal(rows[0]?.created, '2026-10-02 01:23:45.123456+00');
    assert.equal(rows[0]?.read, '2026-10-02 03:45:12.000123+00');
    assert.match(
      rows[1]?.id ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.deepEqual(rows[1]?.data, rows[0]?.data);
    assert.equal(rows[1]?.created, rows[0]?.created);
    assert.equal(rows[1]?.read, rows[0]?.read);
  } finally {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await control.end({ timeout: 5 });
    await Promise.all([
      rm(migrations.base, { force: true, recursive: true }),
      rm(migrations.expanded, { force: true, recursive: true }),
      rm(migrations.guarded, { force: true, recursive: true }),
      rm(migrations.backfilled, { force: true, recursive: true }),
      rm(migrations.backfilledWithLater, { force: true, recursive: true }),
    ]);
  }
});

test('알림 Backfill은 실패한 두 번째 batch 뒤 committed 1,000개를 보존하고 재개한다', async () => {
  const control = postgres(databaseUrl, { max: 1 });
  const migrations = await notificationBackfillMigrationFolders();
  const failId = '30000000-0000-0000-0000-000000001001';

  try {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.base });
    await control.unsafe(`
      INSERT INTO account (id) VALUES
        ('10000000-0000-0000-0000-000000000001'),
        ('10000000-0000-0000-0000-000000000002');
      INSERT INTO profile (id)
      VALUES ('20000000-0000-0000-0000-000000000001');
      INSERT INTO account_profile (account_id, profile_id, role) VALUES
        ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'OWNER'),
        ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'MEMBER');
      INSERT INTO notification (
        id, recipient_profile_id, kind, source_id, data, created_at, read_at
      )
      SELECT
        ('30000000-0000-0000-0000-' || lpad(sequence::text, 12, '0'))::uuid,
        '20000000-0000-0000-0000-000000000001',
        'FOLLOW',
        ('40000000-0000-0000-0000-' || lpad(sequence::text, 12, '0'))::uuid,
        jsonb_build_object('sequence', sequence),
        '2026-10-15T12:00:00Z'::timestamptz + ((sequence - 1) * interval '1 microsecond'),
        CASE
          WHEN sequence % 2 = 0
            THEN '2026-10-15T12:00:00Z'::timestamptz + (sequence * interval '1 microsecond')
          ELSE NULL
        END
      FROM generate_series(1, 2001) AS rows(sequence);
    `);
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.expanded });
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.guarded });
    await control.unsafe(`
      CREATE FUNCTION fail_notification_backfill_second_batch()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.id = '30000000-0000-0000-0000-000000001001'::uuid THEN
          RAISE EXCEPTION 'forced second-batch failure';
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER fail_notification_backfill_second_batch
      BEFORE UPDATE OF recipient_account_id ON notification
      FOR EACH ROW EXECUTE FUNCTION fail_notification_backfill_second_batch();
    `);

    await assert.rejects(
      runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.backfilledWithLater }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /20261017090300_prod_1128_notification_backfill/);
        assert.match(error.message, /partially persisted/i);
        assert.match(
          String((error as Error & { cause?: unknown }).cause),
          /forced second-batch failure/,
        );
        return true;
      },
    );

    const partial = await control.unsafe(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (
          WHERE id::text LIKE '30000000-0000-0000-0000-%'
            AND recipient_account_id = '10000000-0000-0000-0000-000000000001'
        )::int AS processed_originals,
        count(*) FILTER (
          WHERE id::text NOT LIKE '30000000-0000-0000-0000-%'
            AND recipient_account_id = '10000000-0000-0000-0000-000000000002'
        )::int AS copies,
        count(*) FILTER (WHERE recipient_account_id IS NULL)::int AS pending
      FROM notification
    `);
    assert.deepEqual(
      {
        total: partial[0]?.total,
        processedOriginals: partial[0]?.processed_originals,
        copies: partial[0]?.copies,
        pending: partial[0]?.pending,
      },
      { total: 3001, processedOriginals: 1000, copies: 1000, pending: 1001 },
    );
    const [failedRow] = await control<{ account: string | null }[]>`
      SELECT recipient_account_id::text AS account
      FROM notification
      WHERE id = ${failId}
    `;
    assert.equal(failedRow?.account, null);

    const failedHistory = await control.unsafe(`
      SELECT
        count(*) FILTER (
          WHERE name = '20261017090200_prod_1128_notification_backfill_guard'
        )::int AS guard,
        count(*) FILTER (
          WHERE name = '20261017090300_prod_1128_notification_backfill'
        )::int AS backfill
      FROM drizzle.__drizzle_migrations
    `);
    const laterTable = await control.unsafe(`
      SELECT to_regclass('public.notification_backfill_later') IS NOT NULL AS exists
    `);
    assert.equal(failedHistory[0]?.guard, 1);
    assert.equal(failedHistory[0]?.backfill, 0);
    assert.equal(laterTable[0]?.exists, false);

    await control.unsafe(`
      DROP TRIGGER fail_notification_backfill_second_batch ON notification;
      DROP FUNCTION fail_notification_backfill_second_batch();
    `);
    await runDatabaseMigrations({ databaseUrl, migrationsFolder: migrations.backfilledWithLater });

    const finalCounts = await control.unsafe(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (
          WHERE id::text LIKE '30000000-0000-0000-0000-%'
            AND recipient_account_id = '10000000-0000-0000-0000-000000000001'
        )::int AS originals,
        count(*) FILTER (
          WHERE id::text NOT LIKE '30000000-0000-0000-0000-%'
            AND recipient_account_id = '10000000-0000-0000-0000-000000000002'
        )::int AS copies,
        count(*) FILTER (WHERE recipient_account_id IS NULL)::int AS pending,
        count(*) FILTER (
          WHERE data IS DISTINCT FROM jsonb_build_object('sequence', (data ->> 'sequence')::int)
            OR created_at IS DISTINCT FROM (
              '2026-10-15T12:00:00Z'::timestamptz
              + (((data ->> 'sequence')::int - 1) * interval '1 microsecond')
            )
            OR read_at IS DISTINCT FROM CASE
              WHEN (data ->> 'sequence')::int % 2 = 0
                THEN '2026-10-15T12:00:00Z'::timestamptz
                  + ((data ->> 'sequence')::int * interval '1 microsecond')
              ELSE NULL
            END
        )::int AS altered
      FROM notification
    `);
    assert.deepEqual(
      {
        total: finalCounts[0]?.total,
        originals: finalCounts[0]?.originals,
        copies: finalCounts[0]?.copies,
        pending: finalCounts[0]?.pending,
        altered: finalCounts[0]?.altered,
      },
      { total: 4002, originals: 2001, copies: 2001, pending: 0, altered: 0 },
    );

    const sourceFanout = await control.unsafe(`
      SELECT count(*)::int AS malformed
      FROM (
        SELECT source_id
        FROM notification
        GROUP BY source_id
        HAVING count(*) <> 2 OR count(DISTINCT recipient_account_id) <> 2
      ) AS malformed_sources
    `);
    const copyMismatch = await control.unsafe(`
      SELECT count(*)::int AS mismatched
      FROM notification AS original
      JOIN notification AS copy
        ON copy.source_id = original.source_id
        AND copy.recipient_profile_id = original.recipient_profile_id
        AND copy.recipient_account_id = '10000000-0000-0000-0000-000000000002'
      WHERE original.id::text LIKE '30000000-0000-0000-0000-%'
        AND original.recipient_account_id = '10000000-0000-0000-0000-000000000001'
        AND (
          copy.data IS DISTINCT FROM original.data
          OR copy.created_at IS DISTINCT FROM original.created_at
          OR copy.read_at IS DISTINCT FROM original.read_at
        )
    `);
    const laterHistory = await control.unsafe(`
      SELECT count(*)::int AS count
      FROM drizzle.__drizzle_migrations
      WHERE name IN (
        '20261017090300_prod_1128_notification_backfill',
        '20261017090400_test_notification_backfill_later'
      )
    `);
    const laterTableAfterRetry = await control.unsafe(`
      SELECT to_regclass('public.notification_backfill_later') IS NOT NULL AS exists
    `);
    assert.equal(sourceFanout[0]?.malformed, 0);
    assert.equal(copyMismatch[0]?.mismatched, 0);
    assert.equal(laterHistory[0]?.count, 2);
    assert.equal(laterTableAfterRetry[0]?.exists, true);
  } finally {
    await control.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE;',
    );
    await control.unsafe('CREATE SCHEMA public;');
    await control.end({ timeout: 5 });
    await Promise.all([
      rm(migrations.base, { force: true, recursive: true }),
      rm(migrations.expanded, { force: true, recursive: true }),
      rm(migrations.guarded, { force: true, recursive: true }),
      rm(migrations.backfilled, { force: true, recursive: true }),
      rm(migrations.backfilledWithLater, { force: true, recursive: true }),
    ]);
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
