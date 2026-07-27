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
  '20260720142711_tidy_angel',
  '20260720151915_dapper_lady_mastermind',
  '20260721114209_prod_407_reaction_profile_ordering',
  '20260721131532_broken_nighthawk',
  '20260722082715_large_scalphunter',
  '20260723021105_amused_brood',
  '20260723075324_prod_413_reaction_notification',
  '20260723145546_prod_412_repost_notification',
  '20260724180954_prod_426_reply_notification',
  '20260727042621_prod_439_media_upload_state',
  '20260727063711_prod_494_reply_parent_set_null',
  '20260727082945_prod_441_ready_media',
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));
const mappingMigration = new URL(
  '../../../drizzle/20260727125924_prod_498_activitypub_reaction/migration.sql',
  import.meta.url,
);

const instanceId = '00000000-0000-8000-8000-000000000001';
const authorProfileId = '00000000-0000-8000-8000-000000000002';
const reactorProfileId = '00000000-0000-8000-8000-000000000003';
const postId = '00000000-0000-8000-8000-000000000004';

test('adds the ActivityPub Reaction mapping without rewriting existing rows', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

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
        (${reactorProfileId}, ${instanceId}, 'ACTIVE', 'reactor', 'reactor', 'Reactor', 'OPEN')
    `;
    await sql`
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES (${postId}, ${authorProfileId}, 'PUBLIC', 'ACTIVE')
    `;
    const [reaction] = await sql`
      INSERT INTO reaction (profile_id, post_id, type)
      VALUES (${reactorProfileId}, ${postId}, '❤️')
      RETURNING id
    `;

    await sql.unsafe(await readFile(mappingMigration, 'utf8'));

    assert.equal((await sql`SELECT count(*)::int AS count FROM reaction`)[0]?.count, 1);
    assert.deepEqual(
      [
        ...(await sql`
          SELECT column_name AS name, is_nullable AS "isNullable"
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'activitypub_reaction'
          ORDER BY ordinal_position
        `),
      ],
      [
        { name: 'id', isNullable: 'NO' },
        { name: 'uri', isNullable: 'NO' },
        { name: 'reaction_id', isNullable: 'NO' },
      ],
    );

    const foreignKeys = await sql`
      SELECT attribute.attname AS column, foreign_key.confdeltype AS "deleteType"
      FROM pg_constraint AS foreign_key
      INNER JOIN unnest(foreign_key.conkey) AS key(attnum) ON true
      INNER JOIN pg_attribute AS attribute
        ON attribute.attrelid = foreign_key.conrelid
        AND attribute.attnum = key.attnum
      WHERE foreign_key.conrelid = 'activitypub_reaction'::regclass
        AND foreign_key.contype = 'f'
    `;
    assert.deepEqual([...foreignKeys], [{ column: 'reaction_id', deleteType: 'c' }]);

    const [mapping] = await sql`
      INSERT INTO activitypub_reaction (uri, reaction_id)
      VALUES ('https://remote.test/activities/like-one', ${reaction.id})
      RETURNING uuid_extract_version(id)::int AS "idVersion"
    `;
    assert.equal(mapping?.idVersion, 7);

    await assert.rejects(
      sql`
        INSERT INTO activitypub_reaction (uri, reaction_id)
        VALUES ('https://remote.test/activities/like-one', ${reaction.id})
      `,
      { code: '23505' },
    );
    await assert.rejects(
      sql`
        INSERT INTO activitypub_reaction (uri, reaction_id)
        VALUES ('https://remote.test/activities/like-two', ${reaction.id})
      `,
      { code: '23505' },
    );

    await sql`DELETE FROM reaction WHERE id = ${reaction.id}`;
    assert.equal((await sql`SELECT count(*)::int AS count FROM activitypub_reaction`)[0]?.count, 0);
  } finally {
    await sql.end();
  }
});
