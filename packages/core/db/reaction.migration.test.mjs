import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const existingMigrations = [
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
const reactionMigration = new URL(
  '../../../drizzle/20260720151915_dapper_lady_mastermind/migration.sql',
  import.meta.url,
);

const instanceId = '00000000-0000-8000-8000-000000000001';
const authorProfileId = '00000000-0000-8000-8000-000000000002';
const firstReactorProfileId = '00000000-0000-8000-8000-000000000003';
const secondReactorProfileId = '00000000-0000-8000-8000-000000000004';
const firstPostId = '00000000-0000-8000-8000-000000000005';
const secondPostId = '00000000-0000-8000-8000-000000000006';

test('adds the Reaction storage contract without rewriting existing rows', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of existingMigrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }
    await seedExistingRows(sql);

    const existingProfileIds = await rowIds(sql, 'profile');
    const existingPostIds = await rowIds(sql, 'post');

    await sql.unsafe(await readFile(reactionMigration, 'utf8'));

    assert.deepEqual(await rowIds(sql, 'profile'), existingProfileIds);
    assert.deepEqual(await rowIds(sql, 'post'), existingPostIds);

    await verifyCatalog(sql);
    await verifyIntegrity(sql);
  } finally {
    await sql.end();
  }
});

async function verifyCatalog(sql) {
  const [{ relation: reactionTypeRelation }] = await sql`
    SELECT to_regclass('public.reaction_type') AS relation
  `;
  assert.equal(reactionTypeRelation, null);

  assert.deepEqual(
    [
      ...(await sql`
        SELECT
          column_name AS name,
          data_type AS "dataType",
          is_nullable AS "isNullable",
          column_default AS "default"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reaction'
        ORDER BY ordinal_position
      `),
    ],
    [
      { name: 'id', dataType: 'uuid', isNullable: 'NO', default: 'uuidv7()' },
      { name: 'profile_id', dataType: 'uuid', isNullable: 'NO', default: null },
      { name: 'post_id', dataType: 'uuid', isNullable: 'NO', default: null },
      { name: 'type', dataType: 'text', isNullable: 'NO', default: null },
      {
        name: 'created_at',
        dataType: 'timestamp with time zone',
        isNullable: 'NO',
        default: 'now()',
      },
    ],
  );

  assert.deepEqual(
    [
      ...(await sql`
        SELECT
          attribute.attname AS column,
          foreign_key.confdeltype AS "deleteType"
        FROM pg_constraint AS foreign_key
        INNER JOIN unnest(foreign_key.conkey) AS key(attnum) ON true
        INNER JOIN pg_attribute AS attribute
          ON attribute.attrelid = foreign_key.conrelid
          AND attribute.attnum = key.attnum
        WHERE foreign_key.conrelid = 'reaction'::regclass
          AND foreign_key.contype = 'f'
        ORDER BY attribute.attname
      `),
    ],
    [
      { column: 'post_id', deleteType: 'c' },
      { column: 'profile_id', deleteType: 'c' },
    ],
  );

  const [{ checkCount }] = await sql`
    SELECT count(*)::int AS "checkCount"
    FROM pg_constraint
    WHERE conrelid = 'reaction'::regclass AND contype = 'c'
  `;
  assert.equal(checkCount, 0);

  const indexes = await sql`
    SELECT indexname AS name, indexdef AS definition
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'reaction'
      AND indexname <> 'reaction_pkey'
    ORDER BY indexname
  `;
  assert.equal(indexes.length, 2);
  assert.match(
    indexes.find(({ name }) => name === 'reaction_post_id_type_profile_id_unique')?.definition ??
      '',
    /CREATE UNIQUE INDEX .+ \(post_id, type, profile_id\)$/,
  );
  assert.match(
    indexes.find(({ name }) => name === 'reaction_profile_id_index')?.definition ?? '',
    /CREATE INDEX .+ \(profile_id\)$/,
  );
}

async function verifyIntegrity(sql) {
  const [reaction] = await sql`
    INSERT INTO reaction (profile_id, post_id, type)
    VALUES (${firstReactorProfileId}, ${firstPostId}, '🥹')
    RETURNING
      type,
      uuid_extract_version(id)::int AS "idVersion",
      created_at AS "createdAt"
  `;
  assert.equal(reaction?.type, '🥹');
  assert.equal(reaction?.idVersion, 7);
  assert.ok(reaction?.createdAt instanceof Date);

  await assert.rejects(
    sql`
      INSERT INTO reaction (profile_id, post_id, type)
      VALUES (${firstReactorProfileId}, ${firstPostId}, '🥹')
    `,
    { code: '23505' },
  );
  await sql`
    INSERT INTO reaction (profile_id, post_id, type)
    VALUES (${firstReactorProfileId}, ${firstPostId}, '❤️')
  `;
  assert.equal(await reactionCount(sql, { profileId: firstReactorProfileId }), 2);

  await sql`
    INSERT INTO reaction (profile_id, post_id, type)
    VALUES (${secondReactorProfileId}, ${secondPostId}, 'application-validates-this')
  `;
  assert.equal(await reactionCount(sql, { postId: secondPostId }), 1);

  const missingId = '00000000-0000-8000-8000-000000000099';
  await assert.rejects(
    sql`
      INSERT INTO reaction (profile_id, post_id, type)
      VALUES (${missingId}, ${firstPostId}, '🥹')
    `,
    { code: '23503' },
  );
  await assert.rejects(
    sql`
      INSERT INTO reaction (profile_id, post_id, type)
      VALUES (${secondReactorProfileId}, ${missingId}, '🥹')
    `,
    { code: '23503' },
  );

  await sql`DELETE FROM profile WHERE id = ${firstReactorProfileId}`;
  assert.equal(await reactionCount(sql, { profileId: firstReactorProfileId }), 0);

  await sql`
    INSERT INTO reaction (profile_id, post_id, type)
    VALUES (${secondReactorProfileId}, ${firstPostId}, '🥹')
  `;
  await sql`DELETE FROM post WHERE id = ${firstPostId}`;
  assert.equal(await reactionCount(sql, { postId: firstPostId }), 0);
  assert.deepEqual(await rowIds(sql, 'post'), [secondPostId]);
}

async function seedExistingRows(sql) {
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
      (${firstReactorProfileId}, ${instanceId}, 'ACTIVE', 'first', 'first', 'First', 'OPEN'),
      (${secondReactorProfileId}, ${instanceId}, 'ACTIVE', 'second', 'second', 'Second', 'OPEN')
  `;
  await sql`
    INSERT INTO post (id, profile_id, visibility, state)
    VALUES
      (${firstPostId}, ${authorProfileId}, 'PUBLIC', 'ACTIVE'),
      (${secondPostId}, ${authorProfileId}, 'UNLISTED', 'ACTIVE')
  `;
}

async function rowIds(sql, table) {
  return (await sql.unsafe(`SELECT id FROM ${table} ORDER BY id`)).map(({ id }) => id);
}

async function reactionCount(sql, { profileId, postId }) {
  const [result] = profileId
    ? await sql`SELECT count(*)::int AS count FROM reaction WHERE profile_id = ${profileId}`
    : await sql`SELECT count(*)::int AS count FROM reaction WHERE post_id = ${postId}`;
  return result?.count;
}
