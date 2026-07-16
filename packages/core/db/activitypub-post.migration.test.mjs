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
  '20260716052716_swift_speed',
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));

const instanceId = '00000000-0000-8000-8000-000000000001';
const profileId = '00000000-0000-8000-8000-000000000002';
const firstPostId = '00000000-0000-8000-8000-000000000003';
const secondPostId = '00000000-0000-8000-8000-000000000004';
const thirdPostId = '00000000-0000-8000-8000-000000000005';

test('enforces the ActivityPub Post mapping database contract', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of migrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }

    const [catalog] = await sql`
      SELECT
        column_default AS "idDefault",
        to_regclass('public.activitypub_object')::text AS "objectTable",
        to_regclass('public.activitypub_inbox_activity_receipt')::text AS "receiptTable",
        EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'activitypub_object_type'
        ) AS "hasObjectType"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'activitypub_post'
        AND column_name = 'id'
    `;
    assert.deepEqual(catalog, {
      idDefault: 'uuidv7()',
      objectTable: null,
      receiptTable: null,
      hasObjectType: false,
    });

    assert.deepEqual(
      [
        ...(await sql`
          SELECT column_name AS name, is_nullable AS "isNullable"
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'activitypub_post'
          ORDER BY ordinal_position
        `),
      ],
      [
        { name: 'id', isNullable: 'NO' },
        { name: 'uri', isNullable: 'NO' },
        { name: 'post_id', isNullable: 'NO' },
        { name: 'received_at', isNullable: 'NO' },
        { name: 'published_at', isNullable: 'YES' },
      ],
    );

    assert.deepEqual(
      [
        ...(await sql`
          SELECT attribute.attname AS column, foreignKey.confdeltype AS "deleteType"
          FROM pg_constraint AS foreignKey
          INNER JOIN unnest(foreignKey.conkey) AS key(attnum) ON true
          INNER JOIN pg_attribute AS attribute
            ON attribute.attrelid = foreignKey.conrelid AND attribute.attnum = key.attnum
          WHERE foreignKey.conrelid = 'activitypub_post'::regclass
            AND foreignKey.contype = 'f'
        `),
      ],
      [{ column: 'post_id', deleteType: 'c' }],
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
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES
        (${firstPostId}, ${profileId}, 'PUBLIC', 'ACTIVE'),
        (${secondPostId}, ${profileId}, 'PUBLIC', 'ACTIVE'),
        (${thirdPostId}, ${profileId}, 'PUBLIC', 'ACTIVE')
    `;

    const [generatedMapping] = await sql`
      INSERT INTO activitypub_post (uri, post_id, received_at)
      VALUES ('https://remote.test/notes/one', ${firstPostId}, '2026-07-16 05:27:16+00')
      RETURNING uuid_extract_version(id)::int AS "idVersion", published_at AS "publishedAt"
    `;
    assert.deepEqual(generatedMapping, { idVersion: 7, publishedAt: null });

    await sql`
      INSERT INTO activitypub_post (uri, post_id, received_at, published_at)
      VALUES (
        'https://remote.test/notes/two',
        ${secondPostId},
        '2026-07-16 05:27:17+00',
        '2026-07-16 05:00:00+00'
      )
    `;

    await assert.rejects(
      sql`
        INSERT INTO activitypub_post (uri, post_id, received_at)
        VALUES ('https://remote.test/notes/one', ${thirdPostId}, '2026-07-16 05:27:18+00')
      `,
      { code: '23505' },
    );
    await assert.rejects(
      sql`
        INSERT INTO activitypub_post (uri, post_id, received_at)
        VALUES ('https://remote.test/notes/three', ${firstPostId}, '2026-07-16 05:27:18+00')
      `,
      { code: '23505' },
    );

    await sql`UPDATE post SET deleted_at = now() WHERE id = ${secondPostId}`;
    assert.equal(
      (
        await sql`SELECT count(*)::int AS count FROM activitypub_post WHERE post_id = ${secondPostId}`
      )[0]?.count,
      1,
    );

    await sql`DELETE FROM post WHERE id = ${firstPostId}`;
    assert.equal(
      (
        await sql`SELECT count(*)::int AS count FROM activitypub_post WHERE post_id = ${firstPostId}`
      )[0]?.count,
      0,
    );
  } finally {
    await sql.end();
  }
});
