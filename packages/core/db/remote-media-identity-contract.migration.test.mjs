import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const migrationsRoot = new URL('../../../drizzle/', import.meta.url);
const contractName = '20260731103508_prod_627_remote_url_identity_contract';
const contractMigration = new URL(`${contractName}/migration.sql`, migrationsRoot);

test('removes Remote URL identity without rewriting existing Media', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const migrationNames = (await readdir(migrationsRoot))
      .filter((name) => name < contractName)
      .sort();
    for (const migrationName of migrationNames) {
      await sql.unsafe(
        await readFile(new URL(`${migrationName}/migration.sql`, migrationsRoot), 'utf8'),
      );
    }

    const instanceId = '00000000-0000-8000-8000-000000000001';
    const profileId = '00000000-0000-8000-8000-000000000002';
    const mediaId = '00000000-0000-8000-8000-000000000003';
    const url = 'https://remote.example/shared.png';
    await sql`
      INSERT INTO instance (id, domain, kind, state)
      VALUES (${instanceId}, 'remote.example', 'ACTIVITYPUB', 'ACTIVE')
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
      )
      VALUES (${profileId}, ${instanceId}, 'ACTIVE', 'remote', 'remote', 'Remote', 'OPEN')
    `;
    await sql`
      INSERT INTO media (id, source, state, profile_id, media_type, alt_text, url)
      VALUES (${mediaId}, 'REMOTE', 'READY', ${profileId}, 'image/png', 'Before', ${url})
    `;
    const before = await readMedia(sql);

    await sql.unsafe(await readFile(contractMigration, 'utf8'));

    assert.deepEqual(await readMedia(sql), before);
    assert.deepEqual([...(await remoteUrlIndexes(sql))], []);
    await sql`
      INSERT INTO media (source, state, profile_id, media_type, alt_text, url)
      VALUES ('REMOTE', 'READY', ${profileId}, 'image/webp', 'After', ${url})
    `;
    assert.deepEqual(
      (await readMedia(sql)).map(({ altText, mediaType }) => ({ altText, mediaType })),
      [
        { altText: 'Before', mediaType: 'image/png' },
        { altText: 'After', mediaType: 'image/webp' },
      ],
    );
  } finally {
    await sql.end();
  }
});

const readMedia = (sql) => sql`
  SELECT id::text, media_type AS "mediaType", alt_text AS "altText", url
  FROM media
  ORDER BY created_at, id
`;

const remoteUrlIndexes = (sql) => sql`
  SELECT indexname
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'media'
    AND indexname IN ('media_remote_profile_url_unique', 'media_remote_url_unique')
  ORDER BY indexname
`;
