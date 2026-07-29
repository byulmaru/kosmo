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
  '20260727134259_prod_498_activitypub_reaction',
  '20260728082709_prod_489_remove_account_profile_admin',
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));
const profileTagMigration = new URL(
  '../../../drizzle/20260729014146_jazzy_silvermane/migration.sql',
  import.meta.url,
);

const localInstanceId = '00000000-0000-8000-8000-000000000001';
const profileId = '00000000-0000-8000-8000-000000000002';
const otherProfileId = '00000000-0000-8000-8000-000000000003';
const hashtagId = '00000000-0000-8000-8000-000000000004';
const relationId = '00000000-0000-8000-8000-000000000005';

test('enforces the Profile Tag additive storage contract', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of previousMigrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }

    await sql`
      INSERT INTO instance (id, domain, kind, state)
      VALUES
        (${localInstanceId}, 'local.test', 'LOCAL', 'ACTIVE')
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
        (${profileId}, ${localInstanceId}, 'ACTIVE', 'owner', 'owner', 'Owner', 'OPEN'),
        (${otherProfileId}, ${localInstanceId}, 'ACTIVE', 'other', 'other', 'Other', 'OPEN')
    `;

    await sql.unsafe(await readFile(profileTagMigration, 'utf8'));

    assert.deepEqual([...(await sql`SELECT count(*)::int AS count FROM hashtag`)], [{ count: 0 }]);
    assert.deepEqual(
      [...(await sql`SELECT count(*)::int AS count FROM profile_hashtag`)],
      [{ count: 0 }],
    );

    const [hashtag] = await sql`
      INSERT INTO hashtag (id, name)
      VALUES (${hashtagId}, 'kosmo')
      RETURNING uuid_extract_version(id)::int AS "idVersion"
    `;
    assert.deepEqual(hashtag, { idVersion: 8 });

    await sql`
      INSERT INTO profile_hashtag (id, profile_id, hashtag_id, position)
      VALUES (${relationId}, ${profileId}, ${hashtagId}, 0)
    `;

    await assert.rejects(sql`INSERT INTO hashtag (name) VALUES ('kosmo')`, { code: '23505' });
    await assert.rejects(
      sql`INSERT INTO profile_hashtag (profile_id, hashtag_id, position) VALUES (${profileId}, ${hashtagId}, 1)`,
      { code: '23505' },
    );

    const [secondHashtag] = await sql`
      INSERT INTO hashtag (name)
      VALUES ('profile')
      RETURNING id::text AS id
    `;
    await assert.rejects(
      sql`INSERT INTO profile_hashtag (profile_id, hashtag_id, position) VALUES (${profileId}, ${secondHashtag.id}, 0)`,
      { code: '23505' },
    );
    await assert.rejects(
      sql`INSERT INTO profile_hashtag (profile_id, hashtag_id, position) VALUES (${profileId}, ${secondHashtag.id}, 5)`,
      { code: '23514' },
    );
    await assert.rejects(
      sql`INSERT INTO profile_hashtag (profile_id, hashtag_id, position) VALUES (${profileId}, '00000000-0000-8000-8000-000000000099', 1)`,
      { code: '23503' },
    );

    await sql`DELETE FROM profile WHERE id = ${profileId}`;
    assert.deepEqual(
      [
        ...(await sql`SELECT count(*)::int AS count FROM profile_hashtag WHERE profile_id = ${profileId}`),
      ],
      [{ count: 0 }],
    );
    assert.deepEqual(
      [...(await sql`SELECT name FROM hashtag ORDER BY name`)],
      [{ name: 'kosmo' }, { name: 'profile' }],
    );

    await sql`DELETE FROM hashtag WHERE id = ${hashtagId}`;
    assert.deepEqual(
      [
        ...(await sql`SELECT count(*)::int AS count FROM profile_hashtag WHERE hashtag_id = ${hashtagId}`),
      ],
      [{ count: 0 }],
    );
  } finally {
    await sql.end();
  }
});
