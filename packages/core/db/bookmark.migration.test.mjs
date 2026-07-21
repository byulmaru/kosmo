import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const previousMigrations = [
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
const bookmarkMigration = new URL(
  '../../../drizzle/20260720142711_tidy_angel/migration.sql',
  import.meta.url,
);

const instanceId = '00000000-0000-8000-8000-000000000001';
const authorProfileId = '00000000-0000-8000-8000-000000000002';
const firstOwnerProfileId = '00000000-0000-8000-8000-000000000003';
const secondOwnerProfileId = '00000000-0000-8000-8000-000000000004';
const firstPostId = '00000000-0000-8000-8000-000000000005';
const secondPostId = '00000000-0000-8000-8000-000000000006';
const firstBookmarkId = '00000000-0000-8000-8000-000000000010';
const secondBookmarkId = '00000000-0000-8000-8000-000000000011';
const firstConcurrentBookmarkId = '00000000-0000-8000-8000-000000000012';
const secondConcurrentBookmarkId = '00000000-0000-8000-8000-000000000013';
const missingProfileId = '00000000-0000-8000-8000-000000000014';
const missingPostId = '00000000-0000-8000-8000-000000000015';

test('enforces the Bookmark storage database contract', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const firstConcurrentSql = postgres(process.env.DATABASE_URL, { max: 1 });
  const secondConcurrentSql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of previousMigrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }

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

    assert.deepEqual(
      [...(await sql`SELECT id::text FROM post ORDER BY id`)],
      [{ id: firstPostId }, { id: secondPostId }],
    );

    await sql.unsafe(await readFile(bookmarkMigration, 'utf8'));

    assert.deepEqual(
      [...(await sql`SELECT id::text FROM post ORDER BY id`)],
      [{ id: firstPostId }, { id: secondPostId }],
    );

    const [listIndex] = await sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'bookmark'
        AND indexname = 'bookmark_profile_id_id_index'
    `;
    assert.equal(
      listIndex?.indexdef,
      'CREATE INDEX bookmark_profile_id_id_index ON public.bookmark USING btree (profile_id, id DESC NULLS LAST)',
    );

    await assert.rejects(
      sql`INSERT INTO bookmark (profile_id, post_id) VALUES (NULL, ${firstPostId})`,
      { code: '23502' },
    );
    await assert.rejects(
      sql`INSERT INTO bookmark (profile_id, post_id) VALUES (${firstOwnerProfileId}, NULL)`,
      { code: '23502' },
    );
    await assert.rejects(
      sql`INSERT INTO bookmark (profile_id, post_id) VALUES (${missingProfileId}, ${firstPostId})`,
      { code: '23503' },
    );
    await assert.rejects(
      sql`INSERT INTO bookmark (profile_id, post_id) VALUES (${firstOwnerProfileId}, ${missingPostId})`,
      { code: '23503' },
    );

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
          SELECT id::text, created_at::text AS "createdAt"
          FROM bookmark
          WHERE profile_id = ${firstOwnerProfileId} AND post_id = ${firstPostId}
        `),
      ],
      [{ id: firstBookmarkId, createdAt: '2026-07-20 12:00:00+00' }],
    );

    const concurrentResults = await Promise.allSettled([
      firstConcurrentSql`
        INSERT INTO bookmark (id, profile_id, post_id, created_at)
        VALUES (
          ${firstConcurrentBookmarkId},
          ${secondOwnerProfileId},
          ${secondPostId},
          '2026-07-20 12:00:02+00'
        )
        RETURNING id::text, created_at::text AS "createdAt"
      `,
      secondConcurrentSql`
        INSERT INTO bookmark (id, profile_id, post_id, created_at)
        VALUES (
          ${secondConcurrentBookmarkId},
          ${secondOwnerProfileId},
          ${secondPostId},
          '2026-07-20 12:00:03+00'
        )
        RETURNING id::text, created_at::text AS "createdAt"
      `,
    ]);
    const fulfilledConcurrentResults = concurrentResults.filter(
      (result) => result.status === 'fulfilled',
    );
    const rejectedConcurrentResults = concurrentResults.filter(
      (result) => result.status === 'rejected',
    );
    assert.equal(fulfilledConcurrentResults.length, 1);
    assert.equal(rejectedConcurrentResults.length, 1);
    assert.equal(rejectedConcurrentResults[0]?.reason.code, '23505');
    const successfulConcurrentRows = fulfilledConcurrentResults[0]?.value ?? [];
    assert.deepEqual(
      [
        ...(await sql`
          SELECT id::text, created_at::text AS "createdAt"
          FROM bookmark
          WHERE profile_id = ${secondOwnerProfileId} AND post_id = ${secondPostId}
        `),
      ],
      [...successfulConcurrentRows],
    );

    assert.deepEqual(
      [
        ...(await sql`
          SELECT id::text
          FROM bookmark
          WHERE profile_id = ${firstOwnerProfileId}
          ORDER BY id DESC
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

    await sql`DELETE FROM post WHERE id = ${firstPostId}`;
    assert.equal(
      (await sql`SELECT count(*)::int AS count FROM bookmark WHERE post_id = ${firstPostId}`)[0]
        ?.count,
      0,
    );

    await sql`DELETE FROM profile WHERE id = ${secondOwnerProfileId}`;
    assert.deepEqual(
      [
        ...(await sql`
          SELECT profile_id::text AS "profileId", count(*)::int AS count
          FROM bookmark
          GROUP BY profile_id
        `),
      ],
      [{ profileId: firstOwnerProfileId, count: 1 }],
    );
  } finally {
    await Promise.all([sql.end(), firstConcurrentSql.end(), secondConcurrentSql.end()]);
  }
});
