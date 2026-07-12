import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const baseline = new URL(
  '../../../drizzle/20260711065623_light_groot/migration.sql',
  import.meta.url,
);
const cutoverMigration = new URL(
  '../../../drizzle/20260711154404_dashing_marauders/migration.sql',
  import.meta.url,
);

test('preserves canonical post content across the Plain Text cutover', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await sql.unsafe(await readFile(baseline, 'utf8'));
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
      ) VALUES (
        '00000000-0000-8000-8000-000000000002',
        '00000000-0000-8000-8000-000000000001',
        'ACTIVE',
        'writer',
        'writer',
        'Writer',
        'OPEN'
      );

      INSERT INTO post (id, profile_id, visibility, state)
      VALUES (
        '00000000-0000-8000-8000-000000000003',
        '00000000-0000-8000-8000-000000000002',
        'UNLISTED',
        'ACTIVE'
      );

      INSERT INTO post_content (
        id,
        post_id,
        body_text,
        body_json,
        body_html,
        spoiler_text,
        created_at
      ) VALUES
        (
          '00000000-0000-8000-8000-000000000004',
          '00000000-0000-8000-8000-000000000003',
          E'첫 번째 revision\\n빈 줄 전',
          '{"type":"doc"}',
          '<p>legacy</p>',
          NULL,
          '2026-07-11 01:02:03+00'
        ),
        (
          '00000000-0000-8000-8000-000000000005',
          '00000000-0000-8000-8000-000000000003',
          E'현재 revision\\n\\n마지막 줄',
          '{"type":"doc"}',
          NULL,
          '내용 경고',
          '2026-07-11 02:03:04+00'
        );

      UPDATE post
      SET current_content_id = '00000000-0000-8000-8000-000000000005'
      WHERE id = '00000000-0000-8000-8000-000000000003';
    `);

    const beforeCutover = await sql.unsafe(coreSnapshotQuery('spoiler_text'));

    await sql.unsafe(await readFile(cutoverMigration, 'utf8'));

    assert.deepEqual(await sql.unsafe(coreSnapshotQuery('content_warning')), beforeCutover);
    assert.deepEqual(await columnNames(sql), [
      'body_text',
      'content_warning',
      'created_at',
      'id',
      'post_id',
    ]);
  } finally {
    await sql.end();
  }
});

async function columnNames(sql) {
  const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'post_content'
      ORDER BY column_name
    `;

  return columns.map(({ column_name: columnName }) => columnName);
}

function coreSnapshotQuery(contentWarningColumn) {
  return `
    SELECT
      post_content.id::text AS id,
      post_content.post_id::text AS post_id,
      post.current_content_id::text AS current_content_id,
      post_content.body_text,
      post_content.${contentWarningColumn} AS content_warning,
      post_content.created_at::text AS created_at
    FROM post_content
    INNER JOIN post ON post.id = post_content.post_id
    ORDER BY post_content.id
  `;
}
