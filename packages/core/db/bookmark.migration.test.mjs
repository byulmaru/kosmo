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
  '20260720123935_left_lizard',
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));

const instanceId = '00000000-0000-8000-8000-000000000001';
const authorProfileId = '00000000-0000-8000-8000-000000000002';
const firstOwnerProfileId = '00000000-0000-8000-8000-000000000003';
const secondOwnerProfileId = '00000000-0000-8000-8000-000000000004';
const firstPostId = '00000000-0000-8000-8000-000000000005';
const secondPostId = '00000000-0000-8000-8000-000000000006';
const firstBookmarkId = '00000000-0000-8000-8000-000000000010';
const secondBookmarkId = '00000000-0000-8000-8000-000000000011';

test('enforces the Bookmark storage database contract', async () => {
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
        (
          SELECT indexdef
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'bookmark'
            AND indexname = 'bookmark_profile_id_created_at_id_index'
        ) AS "listIndex"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bookmark'
        AND column_name = 'id'
    `;
    assert.deepEqual(catalog, {
      idDefault: 'uuidv7()',
      listIndex:
        'CREATE INDEX bookmark_profile_id_created_at_id_index ON public.bookmark USING btree (profile_id, created_at DESC NULLS LAST, id DESC NULLS LAST)',
    });

    assert.deepEqual(
      [
        ...(await sql`
          SELECT attribute.attname AS column, foreignKey.confdeltype AS "deleteType"
          FROM pg_constraint AS foreignKey
          INNER JOIN unnest(foreignKey.conkey) AS key(attnum) ON true
          INNER JOIN pg_attribute AS attribute
            ON attribute.attrelid = foreignKey.conrelid AND attribute.attnum = key.attnum
          WHERE foreignKey.conrelid = 'bookmark'::regclass
            AND foreignKey.contype = 'f'
          ORDER BY attribute.attname
        `),
      ],
      [
        { column: 'post_id', deleteType: 'a' },
        { column: 'profile_id', deleteType: 'c' },
      ],
    );

    await sql`
      INSERT INTO instance (id, domain, kind, state)
      VALUES (${instanceId}, 'local.test', 'LOCAL', 'ACTIVE')
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
      ) VALUES
        (${authorProfileId}, ${instanceId}, 'ACTIVE', 'author', 'author', 'Author', 'OPEN'),
        (${firstOwnerProfileId}, ${instanceId}, 'ACTIVE', 'owner-one', 'owner-one', 'Owner One', 'OPEN'),
        (${secondOwnerProfileId}, ${instanceId}, 'ACTIVE', 'owner-two', 'owner-two', 'Owner Two', 'OPEN')
    `;
    await sql`
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES
        (${firstPostId}, ${authorProfileId}, 'PUBLIC', 'ACTIVE'),
        (${secondPostId}, ${authorProfileId}, 'PUBLIC', 'ACTIVE')
    `;

    await sql`
      INSERT INTO bookmark (id, profile_id, post_id, created_at)
      VALUES
        (${firstBookmarkId}, ${firstOwnerProfileId}, ${firstPostId}, '2026-07-20 12:00:00+00'),
        (${secondBookmarkId}, ${firstOwnerProfileId}, ${secondPostId}, '2026-07-20 12:00:00+00')
    `;
    const [generatedBookmark] = await sql`
      INSERT INTO bookmark (profile_id, post_id, created_at)
      VALUES (${secondOwnerProfileId}, ${firstPostId}, '2026-07-20 12:00:01+00')
      RETURNING uuid_extract_version(id)::int AS "idVersion"
    `;
    assert.deepEqual(generatedBookmark, { idVersion: 7 });

    await assert.rejects(
      sql`
        INSERT INTO bookmark (profile_id, post_id)
        VALUES (${firstOwnerProfileId}, ${firstPostId})
      `,
      { code: '23505' },
    );

    assert.deepEqual(
      [
        ...(await sql`
          SELECT id::text
          FROM bookmark
          WHERE profile_id = ${firstOwnerProfileId}
          ORDER BY created_at DESC, id DESC
        `),
      ],
      [{ id: secondBookmarkId }, { id: firstBookmarkId }],
    );

    await sql`
      UPDATE post
      SET state = 'DELETED', deleted_at = now()
      WHERE id = ${firstPostId}
    `;
    assert.equal(
      (await sql`SELECT count(*)::int AS count FROM bookmark WHERE post_id = ${firstPostId}`)[0]
        ?.count,
      2,
    );

    await assert.rejects(sql`DELETE FROM post WHERE id = ${firstPostId}`, { code: '23503' });
    assert.equal(
      (await sql`SELECT count(*)::int AS count FROM bookmark WHERE post_id = ${firstPostId}`)[0]
        ?.count,
      2,
    );

    await sql`DELETE FROM profile WHERE id = ${secondOwnerProfileId}`;
    assert.equal(
      (
        await sql`
          SELECT count(*)::int AS count
          FROM bookmark
          WHERE profile_id = ${secondOwnerProfileId}
        `
      )[0]?.count,
      0,
    );
    assert.equal(
      (
        await sql`
          SELECT count(*)::int AS count
          FROM bookmark
          WHERE profile_id = ${firstOwnerProfileId}
        `
      )[0]?.count,
      2,
    );
  } finally {
    await sql.end();
  }
});
