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
  '../../../drizzle/20260720131640_powerful_bloodstorm/migration.sql',
  import.meta.url,
);

const builtInUnicode = new Set(['🥹', '❤️', '🎉', '👀', '☘️', '🌈']);
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
    await verifyBuiltInTypes(sql);
    await verifyIntegrity(sql);
  } finally {
    await sql.end();
  }
});

async function verifyCatalog(sql) {
  assert.deepEqual(
    [
      ...(await sql`
        SELECT
          column_name AS name,
          is_nullable AS "isNullable",
          column_default AS "default"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reaction_type'
        ORDER BY ordinal_position
      `),
    ],
    [
      { name: 'id', isNullable: 'NO', default: 'uuidv7()' },
      { name: 'unicode', isNullable: 'NO', default: null },
      { name: 'created_at', isNullable: 'NO', default: 'now()' },
    ],
  );
  assert.deepEqual(
    [
      ...(await sql`
        SELECT
          column_name AS name,
          is_nullable AS "isNullable",
          column_default AS "default"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reaction'
        ORDER BY ordinal_position
      `),
    ],
    [
      { name: 'id', isNullable: 'NO', default: 'uuidv7()' },
      { name: 'profile_id', isNullable: 'NO', default: null },
      { name: 'post_id', isNullable: 'NO', default: null },
      { name: 'reaction_type_id', isNullable: 'NO', default: null },
      { name: 'created_at', isNullable: 'NO', default: 'now()' },
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
      { column: 'reaction_type_id', deleteType: 'r' },
    ],
  );

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
    indexes.find(({ name }) => name === 'reaction_post_id_reaction_type_id_profile_id_unique')
      ?.definition ?? '',
    /CREATE UNIQUE INDEX .+ \(post_id, reaction_type_id, profile_id\)$/,
  );
  assert.match(
    indexes.find(({ name }) => name === 'reaction_profile_id_index')?.definition ?? '',
    /CREATE INDEX .+ \(profile_id\)$/,
  );
}

async function verifyBuiltInTypes(sql) {
  const types = await sql`
    SELECT
      unicode,
      uuid_extract_version(id)::int AS "idVersion",
      created_at AS "createdAt"
    FROM reaction_type
  `;

  assert.equal(types.length, builtInUnicode.size);
  assert.deepEqual(new Set(types.map(({ unicode }) => unicode)), builtInUnicode);
  assert.ok(types.every(({ idVersion }) => idVersion === 7));
  assert.ok(types.every(({ createdAt }) => createdAt instanceof Date));

  await assert.rejects(sql`INSERT INTO reaction_type (unicode) VALUES ('🥹')`, { code: '23505' });
}

async function verifyIntegrity(sql) {
  const [holdingBackTears] = await sql`
    SELECT id FROM reaction_type WHERE unicode = '🥹'
  `;
  const [heart] = await sql`
    SELECT id FROM reaction_type WHERE unicode = '❤️'
  `;
  assert.ok(holdingBackTears);
  assert.ok(heart);

  const [reaction] = await sql`
    INSERT INTO reaction (profile_id, post_id, reaction_type_id)
    VALUES (${firstReactorProfileId}, ${firstPostId}, ${holdingBackTears.id})
    RETURNING
      uuid_extract_version(id)::int AS "idVersion",
      created_at AS "createdAt"
  `;
  assert.equal(reaction?.idVersion, 7);
  assert.ok(reaction?.createdAt instanceof Date);

  await assert.rejects(
    sql`
      INSERT INTO reaction (profile_id, post_id, reaction_type_id)
      VALUES (${firstReactorProfileId}, ${firstPostId}, ${holdingBackTears.id})
    `,
    { code: '23505' },
  );
  await sql`
    INSERT INTO reaction (profile_id, post_id, reaction_type_id)
    VALUES (${firstReactorProfileId}, ${firstPostId}, ${heart.id})
  `;
  assert.equal(await reactionCount(sql, { profileId: firstReactorProfileId }), 2);

  const missingId = '00000000-0000-8000-8000-000000000099';
  await assert.rejects(
    sql`
      INSERT INTO reaction (profile_id, post_id, reaction_type_id)
      VALUES (${missingId}, ${firstPostId}, ${holdingBackTears.id})
    `,
    { code: '23503' },
  );
  await assert.rejects(
    sql`
      INSERT INTO reaction (profile_id, post_id, reaction_type_id)
      VALUES (${secondReactorProfileId}, ${missingId}, ${holdingBackTears.id})
    `,
    { code: '23503' },
  );
  await assert.rejects(
    sql`
      INSERT INTO reaction (profile_id, post_id, reaction_type_id)
      VALUES (${secondReactorProfileId}, ${firstPostId}, ${missingId})
    `,
    { code: '23503' },
  );
  await assert.rejects(sql`DELETE FROM reaction_type WHERE id = ${holdingBackTears.id}`, {
    code: '23001',
  });

  await sql`DELETE FROM profile WHERE id = ${firstReactorProfileId}`;
  assert.equal(await reactionCount(sql, { profileId: firstReactorProfileId }), 0);

  await sql`
    INSERT INTO reaction (profile_id, post_id, reaction_type_id)
    VALUES (${secondReactorProfileId}, ${firstPostId}, ${holdingBackTears.id})
  `;
  await sql`DELETE FROM post WHERE id = ${firstPostId}`;
  assert.equal(await reactionCount(sql, { postId: firstPostId }), 0);
  assert.deepEqual(await rowIds(sql, 'post'), [secondPostId]);
  assert.equal((await sql`SELECT count(*)::int AS count FROM reaction_type`)[0]?.count, 6);
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
