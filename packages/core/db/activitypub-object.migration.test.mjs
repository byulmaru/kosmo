import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const migrations = [
  '20260711065623_light_groot',
  '20260711154404_dashing_marauders',
  '20260711162858_add_activitypub_actor_remote_metadata',
  '20260712053904_shocking_human_fly',
  '20260714085502_flaky_abomination',
  '20260715011345_add_notification',
  '20260715154358_merge_migration_heads',
  '20260715154418_use_postgres_uuidv7',
  '20260716024032_living_mystique',
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));

const instanceId = '00000000-0000-8000-8000-000000000001';
const profileId = '00000000-0000-8000-8000-000000000002';
const actorId = '00000000-0000-8000-8000-000000000003';
const firstPostId = '00000000-0000-8000-8000-000000000004';
const secondPostId = '00000000-0000-8000-8000-000000000005';
const thirdPostId = '00000000-0000-8000-8000-000000000006';
const explicitObjectId = '00000000-0000-8000-8000-000000000007';

test('enforces the ActivityPub object mapping database contract', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of migrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }

    assert.deepEqual(
      [
        ...(await sql`
          SELECT enumlabel AS value
          FROM pg_enum
          INNER JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'activitypub_object_type'
          ORDER BY enumsortorder
        `),
      ],
      [{ value: 'NOTE' }],
    );

    const [catalog] = await sql`
      SELECT
        column_default AS "idDefault",
        (
          SELECT count(*)::int
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'activitypub_object'
            AND indexdef LIKE '%(activitypub_actor_id)%'
            AND indexdef NOT LIKE 'CREATE UNIQUE%'
        ) AS "actorIndexCount",
        to_regclass('public.activitypub_inbox_activity_receipt')::text AS "receiptTable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'activitypub_object'
        AND column_name = 'id'
    `;
    assert.deepEqual(catalog, {
      idDefault: 'uuidv7()',
      actorIndexCount: 1,
      receiptTable: null,
    });

    assert.deepEqual(
      [
        ...(await sql`
          SELECT attribute.attname AS column, foreignKey.confdeltype AS "deleteType"
          FROM pg_constraint AS foreignKey
          INNER JOIN unnest(foreignKey.conkey) AS key(attnum) ON true
          INNER JOIN pg_attribute AS attribute
            ON attribute.attrelid = foreignKey.conrelid AND attribute.attnum = key.attnum
          WHERE foreignKey.conrelid = 'activitypub_object'::regclass
            AND foreignKey.contype = 'f'
          ORDER BY attribute.attname
        `),
      ],
      [
        { column: 'activitypub_actor_id', deleteType: 'r' },
        { column: 'post_id', deleteType: 'c' },
      ],
    );

    await sql`
      INSERT INTO instance (id, domain, kind, state)
      VALUES (${instanceId}, 'remote.test', 'ACTIVITYPUB', 'ACTIVE')
    `;
    await sql`
      INSERT INTO profile (
        id,
        instance_id,
        state,
        handle,
        normalized_handle,
        display_name,
        follow_policy
      ) VALUES (${profileId}, ${instanceId}, 'ACTIVE', 'remote', 'remote', 'Remote', 'OPEN')
    `;
    await sql`
      INSERT INTO activitypub_actor (id, profile_id, uri, type)
      VALUES (${actorId}, ${profileId}, 'https://remote.test/users/remote', 'PERSON')
    `;
    await sql`
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES
        (${firstPostId}, ${profileId}, 'PUBLIC', 'ACTIVE'),
        (${secondPostId}, ${profileId}, 'PUBLIC', 'ACTIVE'),
        (${thirdPostId}, ${profileId}, 'PUBLIC', 'ACTIVE')
    `;

    const [generatedObject] = await sql`
      INSERT INTO activitypub_object (
        uri,
        type,
        activitypub_actor_id,
        post_id,
        received_at
      ) VALUES (
        'https://remote.test/notes/one',
        'NOTE',
        ${actorId},
        ${firstPostId},
        '2026-07-16 02:40:32+00'
      )
      RETURNING uuid_extract_version(id)::int AS "idVersion", published_at AS "publishedAt"
    `;
    assert.deepEqual(generatedObject, { idVersion: 7, publishedAt: null });

    await sql`
      INSERT INTO activitypub_object (
        id,
        uri,
        type,
        activitypub_actor_id,
        post_id,
        received_at,
        published_at
      ) VALUES (
        ${explicitObjectId},
        'https://remote.test/notes/two',
        'NOTE',
        ${actorId},
        ${secondPostId},
        '2026-07-16 02:40:33+00',
        '2026-07-16 02:00:00+00'
      )
    `;
    assert.equal(
      (
        await sql`
          SELECT count(*)::int AS count
          FROM activitypub_object
          WHERE activitypub_actor_id = ${actorId} AND type = 'NOTE'
        `
      )[0]?.count,
      2,
    );

    await assert.rejects(
      sql`
        INSERT INTO activitypub_object (uri, type, activitypub_actor_id, post_id, received_at)
        VALUES (
          'https://remote.test/notes/one',
          'NOTE',
          ${actorId},
          ${thirdPostId},
          '2026-07-16 02:40:34+00'
        )
      `,
      { code: '23505' },
    );
    await assert.rejects(
      sql`
        INSERT INTO activitypub_object (uri, type, activitypub_actor_id, post_id, received_at)
        VALUES (
          'https://remote.test/notes/three',
          'NOTE',
          ${actorId},
          ${firstPostId},
          '2026-07-16 02:40:34+00'
        )
      `,
      { code: '23505' },
    );
    await assert.rejects(sql`DELETE FROM activitypub_actor WHERE id = ${actorId}`, {
      code: '23001',
    });

    await sql`UPDATE post SET deleted_at = now() WHERE id = ${secondPostId}`;
    assert.equal(
      (
        await sql`SELECT count(*)::int AS count FROM activitypub_object WHERE post_id = ${secondPostId}`
      )[0]?.count,
      1,
    );

    await sql`DELETE FROM post WHERE id = ${firstPostId}`;
    assert.equal(
      (
        await sql`SELECT count(*)::int AS count FROM activitypub_object WHERE post_id = ${firstPostId}`
      )[0]?.count,
      0,
    );
  } finally {
    await sql.end();
  }
});
