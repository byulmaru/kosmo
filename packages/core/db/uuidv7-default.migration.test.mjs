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
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));
const uuidv7Migration = new URL(
  '../../../drizzle/20260715154418_use_postgres_uuidv7/migration.sql',
  import.meta.url,
);

test('moves new IDs to PostgreSQL uuidv7 defaults without rewriting existing UUIDv8 IDs', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const existingId = '00000000-0000-8000-8000-000000000001';

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of migrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }

    await sql`
      INSERT INTO instance (id, domain, kind, state)
      VALUES (${existingId}, 'existing.example', 'LOCAL', 'ACTIVE')
    `;
    await sql.unsafe(await readFile(uuidv7Migration, 'utf8'));

    const [existing] = await sql`
      SELECT id::text AS id, uuid_extract_version(id)::int AS version
      FROM instance
      WHERE domain = 'existing.example'
    `;
    assert.deepEqual(existing, { id: existingId, version: 8 });

    const [created] = await sql`
      INSERT INTO instance (domain, kind, state)
      VALUES ('new.example', 'LOCAL', 'ACTIVE')
      RETURNING
        id::text AS id,
        uuid_extract_version(id)::int AS version,
        uuid_extract_timestamp(id) AS "createdAt"
    `;
    assert.equal(created?.version, 7);
    assert.ok(Math.abs(created.createdAt.getTime() - Date.now()) < 5_000);
  } finally {
    await sql.end();
  }
});
