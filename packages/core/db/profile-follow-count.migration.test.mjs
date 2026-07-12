import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const migrations = [
  new URL('../../../drizzle/20260711065623_light_groot/migration.sql', import.meta.url),
  new URL('../../../drizzle/20260711154404_dashing_marauders/migration.sql', import.meta.url),
];
const countMigration = new URL(
  '../../../drizzle/20260712053904_shocking_human_fly/migration.sql',
  import.meta.url,
);

test('backfills profile follow counts without changing established follows', async () => {
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
          'OPEN'
        ),
        (
          '00000000-0000-8000-8000-000000000004',
          '00000000-0000-8000-8000-000000000001',
          'ACTIVE',
          'second',
          'second',
          'Second',
          'OPEN'
        );

      INSERT INTO profile_follow (id, follower_profile_id, followee_profile_id)
      VALUES
        (
          '00000000-0000-8000-8000-000000000005',
          '00000000-0000-8000-8000-000000000002',
          '00000000-0000-8000-8000-000000000003'
        ),
        (
          '00000000-0000-8000-8000-000000000006',
          '00000000-0000-8000-8000-000000000004',
          '00000000-0000-8000-8000-000000000003'
        ),
        (
          '00000000-0000-8000-8000-000000000007',
          '00000000-0000-8000-8000-000000000002',
          '00000000-0000-8000-8000-000000000004'
        );
    `);

    await sql.unsafe(await readFile(countMigration, 'utf8'));

    assert.deepEqual(
      [
        ...(await sql`
        SELECT
          handle,
          followers_count AS "followersCount",
          following_count AS "followingCount"
        FROM profile
        ORDER BY handle
      `),
      ],
      [
        { handle: 'followee', followersCount: 2, followingCount: 0 },
        { handle: 'follower', followersCount: 0, followingCount: 2 },
        { handle: 'second', followersCount: 1, followingCount: 1 },
      ],
    );
    assert.equal((await sql`SELECT count(*)::int AS count FROM profile_follow`)[0]?.count, 3);
  } finally {
    await sql.end();
  }
});
