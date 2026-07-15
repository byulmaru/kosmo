import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const migrations = [
  new URL('../../../drizzle/20260711065623_light_groot/migration.sql', import.meta.url),
  new URL('../../../drizzle/20260711154404_dashing_marauders/migration.sql', import.meta.url),
  new URL(
    '../../../drizzle/20260711162858_add_activitypub_actor_remote_metadata/migration.sql',
    import.meta.url,
  ),
  new URL('../../../drizzle/20260712053904_shocking_human_fly/migration.sql', import.meta.url),
  new URL('../../../drizzle/20260715011345_add_notification/migration.sql', import.meta.url),
];

test('creates the minimal Notification projection and query indexes', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of migrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }

    const columns = await sql`
      SELECT
        column_name AS "name",
        data_type AS "dataType",
        udt_name AS "udtName",
        is_nullable AS "isNullable",
        column_default AS "default"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notification'
      ORDER BY ordinal_position
    `;

    assert.deepEqual(
      columns.map(({ name }) => name),
      ['id', 'recipient_profile_id', 'kind', 'source_id', 'data', 'created_at', 'read_at'],
    );
    assert.deepEqual(
      columns.map(({ dataType, isNullable, name, udtName }) => ({
        name,
        dataType,
        udtName,
        isNullable,
      })),
      [
        { name: 'id', dataType: 'uuid', udtName: 'uuid', isNullable: 'NO' },
        {
          name: 'recipient_profile_id',
          dataType: 'uuid',
          udtName: 'uuid',
          isNullable: 'NO',
        },
        {
          name: 'kind',
          dataType: 'USER-DEFINED',
          udtName: 'notification_kind',
          isNullable: 'NO',
        },
        { name: 'source_id', dataType: 'uuid', udtName: 'uuid', isNullable: 'NO' },
        { name: 'data', dataType: 'jsonb', udtName: 'jsonb', isNullable: 'NO' },
        {
          name: 'created_at',
          dataType: 'timestamp with time zone',
          udtName: 'timestamptz',
          isNullable: 'NO',
        },
        {
          name: 'read_at',
          dataType: 'timestamp with time zone',
          udtName: 'timestamptz',
          isNullable: 'YES',
        },
      ],
    );
    assert.equal(columns.find(({ name }) => name === 'kind')?.default, null);
    assert.equal(columns.find(({ name }) => name === 'data')?.default, `'{}'::jsonb`);

    const enumValues = await sql`
      SELECT enumlabel AS "value"
      FROM pg_enum
      INNER JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'notification_kind'
      ORDER BY pg_enum.enumsortorder
    `;
    assert.deepEqual(
      enumValues.map(({ value }) => value),
      ['FOLLOW'],
    );

    const constraints = await sql`
      SELECT
        contype AS "type",
        condeferrable AS "deferrable",
        pg_get_constraintdef(oid) AS "definition"
      FROM pg_constraint
      WHERE conrelid = 'notification'::regclass
      ORDER BY conname
    `;
    assert.ok(
      constraints.some(
        ({ definition, type }) =>
          type === 'f' &&
          definition ===
            'FOREIGN KEY (recipient_profile_id) REFERENCES profile(id) ON DELETE CASCADE',
      ),
    );
    assert.ok(
      constraints.some(
        ({ definition, type }) =>
          type === 'u' && definition === 'UNIQUE (recipient_profile_id, kind, source_id)',
      ),
    );
    assert.equal(
      constraints.some(({ definition, type }) => type === 'f' && definition.includes('source_id')),
      false,
    );
    assert.equal(
      constraints.some(({ deferrable }) => deferrable),
      false,
    );

    const indexes = await sql`
      SELECT
        pg_get_indexdef(indexrelid) AS "definition",
        pg_get_expr(indpred, indrelid) AS "predicate"
      FROM pg_index
      WHERE indrelid = 'notification'::regclass
    `;
    assert.ok(
      indexes.some(
        ({ definition, predicate }) =>
          predicate === null && definition.includes('(recipient_profile_id, id DESC NULLS LAST)'),
      ),
    );
    assert.ok(
      indexes.some(
        ({ definition, predicate }) =>
          definition.includes('(recipient_profile_id)') && predicate === '(read_at IS NULL)',
      ),
    );
    assert.equal(
      indexes.some(({ definition }) => definition.includes('USING gin')),
      false,
    );
    assert.equal(
      indexes.some(({ definition }) => definition.includes('(kind, source_id)')),
      false,
    );

    const [forbiddenSchema] = await sql`
      SELECT
        to_regclass('public.notification_follow')::text AS "extensionTable",
        (
          SELECT count(*)::int
          FROM pg_trigger
          WHERE tgrelid = 'notification'::regclass AND NOT tgisinternal
        ) AS "userTriggerCount"
    `;
    assert.deepEqual(forbiddenSchema, { extensionTable: null, userTriggerCount: 0 });

    await sql.unsafe(`
      INSERT INTO instance (id, domain, kind, state)
      VALUES ('00000000-0000-8000-8000-000000000001', 'local.test', 'LOCAL', 'ACTIVE');

      INSERT INTO profile (
        id,
        instance_id,
        state,
        handle,
        normalized_handle,
        display_name,
        follow_policy
      ) VALUES
        (
          '00000000-0000-8000-8000-000000000002',
          '00000000-0000-8000-8000-000000000001',
          'ACTIVE',
          'recipient-a',
          'recipient-a',
          'Recipient A',
          'OPEN'
        ),
        (
          '00000000-0000-8000-8000-000000000003',
          '00000000-0000-8000-8000-000000000001',
          'ACTIVE',
          'recipient-b',
          'recipient-b',
          'Recipient B',
          'OPEN'
        );
    `);

    await assert.rejects(
      sql`
        INSERT INTO notification (id, recipient_profile_id, kind, source_id)
        VALUES (
          '00000000-0000-8000-8000-000000000004',
          '00000000-0000-8000-8000-000000000099',
          'FOLLOW',
          '00000000-0000-8000-8000-000000000010'
        )
      `,
      ({ code }) => code === '23503',
    );

    await sql`
      INSERT INTO notification (id, recipient_profile_id, kind, source_id)
      VALUES (
        '00000000-0000-8000-8000-000000000005',
        '00000000-0000-8000-8000-000000000002',
        'FOLLOW',
        '00000000-0000-8000-8000-000000000010'
      )
    `;
    const [notification] = await sql`
      SELECT kind, data, read_at AS "readAt"
      FROM notification
      WHERE id = '00000000-0000-8000-8000-000000000005'
    `;
    assert.deepEqual(notification, { kind: 'FOLLOW', data: {}, readAt: null });

    await assert.rejects(
      sql`
        INSERT INTO notification (id, recipient_profile_id, kind, source_id)
        VALUES (
          '00000000-0000-8000-8000-000000000006',
          '00000000-0000-8000-8000-000000000002',
          'FOLLOW',
          '00000000-0000-8000-8000-000000000010'
        )
      `,
      ({ code }) => code === '23505',
    );

    await sql`
      INSERT INTO notification (id, recipient_profile_id, kind, source_id)
      VALUES (
        '00000000-0000-8000-8000-000000000007',
        '00000000-0000-8000-8000-000000000003',
        'FOLLOW',
        '00000000-0000-8000-8000-000000000010'
      )
    `;
    assert.equal(
      (
        await sql`
          SELECT count(*)::int AS "count"
          FROM notification
          WHERE source_id = '00000000-0000-8000-8000-000000000010'
        `
      )[0]?.count,
      2,
    );

    await sql`
      DELETE FROM profile
      WHERE id = '00000000-0000-8000-8000-000000000002'
    `;
    assert.equal(
      (
        await sql`
          SELECT count(*)::int AS "count"
          FROM notification
          WHERE recipient_profile_id = '00000000-0000-8000-8000-000000000002'
        `
      )[0]?.count,
      0,
    );
  } finally {
    await sql.end();
  }
});
