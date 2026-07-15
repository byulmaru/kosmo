import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const baseline = new URL(
  '../../../drizzle/20260711065623_light_groot/migration.sql',
  import.meta.url,
);
const plainTextCutover = new URL(
  '../../../drizzle/20260711154404_dashing_marauders/migration.sql',
  import.meta.url,
);
const documentCutover = new URL(
  '../../../drizzle/20260714085502_flaky_abomination/migration.sql',
  import.meta.url,
);

test('deletes non-production posts before requiring versioned documents', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await sql.unsafe(await readFile(baseline, 'utf8'));
    await sql.unsafe(await readFile(plainTextCutover, 'utf8'));
    await seedPlainTextPost(sql);

    await sql.unsafe(await readFile(documentCutover, 'utf8'));

    assert.equal((await sql`SELECT id FROM post`).length, 0);
    assert.equal((await sql`SELECT id FROM post_content`).length, 0);
    assert.deepEqual(await columns(sql), [
      { columnName: 'created_at', isNullable: 'NO' },
      { columnName: 'document', isNullable: 'NO' },
      { columnName: 'id', isNullable: 'NO' },
      { columnName: 'post_id', isNullable: 'NO' },
    ]);

    await sql.unsafe(`
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES (
        '00000000-0000-8000-8000-000000000006',
        '00000000-0000-8000-8000-000000000002',
        'UNLISTED',
        'ACTIVE'
      );

      INSERT INTO post_content (
        id,
        post_id,
        document
      ) VALUES (
        '00000000-0000-8000-8000-000000000007',
        '00000000-0000-8000-8000-000000000006',
        '{"version":1,"summary":"내용 경고","body":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"새 본문"}]}]}}'
      );

      UPDATE post
      SET current_content_id = '00000000-0000-8000-8000-000000000007'
      WHERE id = '00000000-0000-8000-8000-000000000006';
    `);

    assert.deepEqual(
      [
        ...(await sql`
      SELECT
        document
      FROM post_content
    `),
      ],
      [
        {
          document: {
            version: 1,
            summary: '내용 경고',
            body: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '새 본문' }] }],
            },
          },
        },
      ],
    );
  } finally {
    await sql.end();
  }
});

async function seedPlainTextPost(sql) {
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

    INSERT INTO post_content (id, post_id, body_text, content_warning)
    VALUES (
      '00000000-0000-8000-8000-000000000005',
      '00000000-0000-8000-8000-000000000003',
      E'현재 revision\n본문',
      '기존 내용 경고'
    );

    UPDATE post
    SET current_content_id = '00000000-0000-8000-8000-000000000005'
    WHERE id = '00000000-0000-8000-8000-000000000003';
  `);
}

async function columns(sql) {
  return [
    ...(await sql`
    SELECT column_name AS "columnName", is_nullable AS "isNullable"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'post_content'
    ORDER BY column_name
  `),
  ];
}
