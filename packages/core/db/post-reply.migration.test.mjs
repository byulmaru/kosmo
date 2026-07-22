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
  '20260721131532_broken_nighthawk',
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));
const replyMigration = new URL(
  '../../../drizzle/20260722082715_large_scalphunter/migration.sql',
  import.meta.url,
);

const ids = {
  instance: '00000000-0000-8000-8000-000000000001',
  author: '00000000-0000-8000-8000-000000000002',
  source: '00000000-0000-8000-8000-000000000003',
  parent: '00000000-0000-8000-8000-000000000004',
  existingPost: '00000000-0000-8000-8000-000000000005',
  repost: '00000000-0000-8000-8000-000000000006',
  quote: '00000000-0000-8000-8000-000000000007',
  reply: '00000000-0000-8000-8000-000000000008',
  replyQuote: '00000000-0000-8000-8000-000000000009',
  duplicateRepost: '00000000-0000-8000-8000-000000000010',
  sourceContent: '00000000-0000-8000-8000-000000000011',
  parentContent: '00000000-0000-8000-8000-000000000012',
  quoteContent: '00000000-0000-8000-8000-000000000013',
  replyContent: '00000000-0000-8000-8000-000000000014',
  replyQuoteContent: '00000000-0000-8000-8000-000000000015',
  missingPost: '00000000-0000-8000-8000-000000000099',
};

test('adds Reply Parent without rewriting existing Post and Repost contracts', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of previousMigrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }
    await seedRows(sql);

    const existingRows = [
      ...(await sql`
        SELECT
          id::text,
          current_content_id::text AS "currentContentId",
          repost_source_id::text AS "repostSourceId"
        FROM post
        ORDER BY id
      `),
    ];
    const repostIndexBefore = await getRepostIndexDefinition(sql);

    await sql.unsafe(await readFile(replyMigration, 'utf8'));

    assert.deepEqual(
      [
        ...(await sql`
          SELECT
            id::text,
            current_content_id::text AS "currentContentId",
            reply_parent_id::text AS "replyParentId",
            repost_source_id::text AS "repostSourceId"
          FROM post
          ORDER BY id
        `),
      ],
      existingRows.map((row) => ({ ...row, replyParentId: null })),
    );
    await verifyCatalog(sql, repostIndexBefore);

    await assert.rejects(
      sql`
        INSERT INTO post (profile_id, visibility, state, reply_parent_id)
        VALUES (${ids.author}, 'PUBLIC', 'ACTIVE', ${ids.missingPost})
      `,
      { code: '23503' },
    );
    await assert.rejects(
      sql`
        INSERT INTO post (id, profile_id, visibility, state, reply_parent_id)
        VALUES (${ids.reply}, ${ids.author}, 'PUBLIC', 'ACTIVE', ${ids.reply})
      `,
      { code: '23514' },
    );

    await insertContentfulPost(sql, {
      contentId: ids.replyContent,
      id: ids.reply,
      replyParentId: ids.parent,
    });
    await insertContentfulPost(sql, {
      contentId: ids.replyQuoteContent,
      id: ids.replyQuote,
      replyParentId: ids.source,
      repostSourceId: ids.source,
    });

    assert.deepEqual(
      [
        ...(await sql`
          SELECT
            id::text,
            reply_parent_id::text AS "replyParentId",
            repost_source_id::text AS "repostSourceId"
          FROM post
          WHERE id IN (${ids.reply}, ${ids.replyQuote})
          ORDER BY id
        `),
      ],
      [
        { id: ids.reply, replyParentId: ids.parent, repostSourceId: null },
        { id: ids.replyQuote, replyParentId: ids.source, repostSourceId: ids.source },
      ],
    );

    await sql`
      UPDATE post
      SET state = 'DELETED', deleted_at = now()
      WHERE id = ${ids.parent}
    `;
    assert.equal(
      (await sql`SELECT reply_parent_id::text AS id FROM post WHERE id = ${ids.reply}`)[0]?.id,
      ids.parent,
    );

    await assert.rejects(
      sql`
        INSERT INTO post (id, profile_id, visibility, state, repost_source_id)
        VALUES (${ids.duplicateRepost}, ${ids.author}, 'PUBLIC', 'ACTIVE', ${ids.source})
      `,
      { code: '23505' },
    );
  } finally {
    await sql.end();
  }
});

async function verifyCatalog(sql, repostIndexBefore) {
  assert.deepEqual(
    [
      ...(await sql`
        SELECT data_type AS "dataType", is_nullable AS "isNullable"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'post'
          AND column_name = 'reply_parent_id'
      `),
    ],
    [{ dataType: 'uuid', isNullable: 'YES' }],
  );
  assert.deepEqual(
    [
      ...(await sql`
        SELECT
          referenced.relname AS "referencedTable",
          foreign_key.confdeltype AS "deleteType"
        FROM pg_constraint AS foreign_key
        JOIN pg_class AS referenced ON referenced.oid = foreign_key.confrelid
        WHERE foreign_key.conrelid = 'post'::regclass
          AND foreign_key.conname = 'post_reply_parent_id_post_id_fkey'
      `),
    ],
    [{ referencedTable: 'post', deleteType: 'a' }],
  );
  assert.match(
    (
      await sql`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'post'::regclass
          AND conname = 'post_reply_parent_not_self'
      `
    )[0]?.definition ?? '',
    /CHECK .+reply_parent_id IS NULL.+reply_parent_id <> id/,
  );
  assert.equal(await getRepostIndexDefinition(sql), repostIndexBefore);
}

async function getRepostIndexDefinition(sql) {
  return (
    await sql`
      SELECT indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'post'
        AND indexname = 'post_active_repost_profile_source_unique'
    `
  )[0]?.definition;
}

async function seedRows(sql) {
  await sql`
    INSERT INTO instance (id, domain, kind, state)
    VALUES (${ids.instance}, 'local.test', 'LOCAL', 'ACTIVE')
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
    ) VALUES (${ids.author}, ${ids.instance}, 'ACTIVE', 'author', 'author', 'Author', 'OPEN')
  `;
  await sql`
    INSERT INTO post (id, profile_id, visibility, state)
    VALUES
      (${ids.source}, ${ids.author}, 'PUBLIC', 'ACTIVE'),
      (${ids.parent}, ${ids.author}, 'PUBLIC', 'ACTIVE'),
      (${ids.existingPost}, ${ids.author}, 'UNLISTED', 'ACTIVE'),
      (${ids.quote}, ${ids.author}, 'PUBLIC', 'ACTIVE')
  `;
  await sql`
    INSERT INTO post_content (id, post_id, document)
    VALUES
      (${ids.sourceContent}, ${ids.source}, ${sql.json(postDocument('source'))}),
      (${ids.parentContent}, ${ids.parent}, ${sql.json(postDocument('parent'))}),
      (${ids.quoteContent}, ${ids.quote}, ${sql.json(postDocument('quote'))})
  `;
  await sql`
    UPDATE post
    SET current_content_id = CASE id
      WHEN ${ids.source} THEN ${ids.sourceContent}::uuid
      WHEN ${ids.parent} THEN ${ids.parentContent}::uuid
      WHEN ${ids.quote} THEN ${ids.quoteContent}::uuid
    END
    WHERE id IN (${ids.source}, ${ids.parent}, ${ids.quote})
  `;
  await sql`
    UPDATE post
    SET repost_source_id = ${ids.source}
    WHERE id = ${ids.quote}
  `;
  await sql`
    INSERT INTO post (id, profile_id, visibility, state, repost_source_id)
    VALUES (${ids.repost}, ${ids.author}, 'PUBLIC', 'ACTIVE', ${ids.source})
  `;
}

async function insertContentfulPost(sql, { contentId, id, replyParentId, repostSourceId = null }) {
  await sql`
    INSERT INTO post (id, profile_id, visibility, state)
    VALUES (${id}, ${ids.author}, 'PUBLIC', 'ACTIVE')
  `;
  await sql`
    INSERT INTO post_content (id, post_id, document)
    VALUES (${contentId}, ${id}, ${sql.json(postDocument('reply'))})
  `;
  await sql`
    UPDATE post
    SET
      current_content_id = ${contentId},
      reply_parent_id = ${replyParentId},
      repost_source_id = ${repostSourceId}
    WHERE id = ${id}
  `;
}

function postDocument(body) {
  return {
    body: { content: [{ text: body, type: 'text' }], type: 'paragraph' },
    summary: null,
    version: 1,
  };
}
