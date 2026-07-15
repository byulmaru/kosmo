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
];
const correlationMigration = new URL(
  '../../../drizzle/20260715092054_even_husk/migration.sql',
  import.meta.url,
);

test('adds nullable inbound correlation without backfilling existing follow rows', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of migrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }
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
          'follower',
          'follower',
          'Follower',
          'OPEN'
        ),
        (
          '00000000-0000-8000-8000-000000000003',
          '00000000-0000-8000-8000-000000000001',
          'ACTIVE',
          'followee',
          'followee',
          'Followee',
          'APPROVAL_REQUIRED'
        );

      INSERT INTO profile_follow (id, follower_profile_id, followee_profile_id)
      VALUES (
        '00000000-0000-8000-8000-000000000004',
        '00000000-0000-8000-8000-000000000002',
        '00000000-0000-8000-8000-000000000003'
      );

      INSERT INTO profile_follow_request (id, follower_profile_id, followee_profile_id)
      VALUES (
        '00000000-0000-8000-8000-000000000005',
        '00000000-0000-8000-8000-000000000003',
        '00000000-0000-8000-8000-000000000002'
      );
    `);

    await sql.unsafe(await readFile(correlationMigration, 'utf8'));

    for (const table of ['profile_follow', 'profile_follow_request']) {
      const [row] = await sql.unsafe(`
        SELECT
          inbound_follow_activity_id,
          inbound_follow_actor_uri,
          inbound_follow_object_uri
        FROM ${table}
      `);
      assert.deepEqual(row, {
        inbound_follow_activity_id: null,
        inbound_follow_actor_uri: null,
        inbound_follow_object_uri: null,
      });
    }
  } finally {
    await sql.end();
  }
});
