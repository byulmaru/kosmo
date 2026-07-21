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
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));
const repostMigration = new URL(
  '../../../drizzle/20260721131532_broken_nighthawk/migration.sql',
  import.meta.url,
);

const ids = {
  instance: '00000000-0000-8000-8000-000000000001',
  author: '00000000-0000-8000-8000-000000000002',
  concurrentAuthor: '00000000-0000-8000-8000-000000000003',
  source: '00000000-0000-8000-8000-000000000004',
  existingPost: '00000000-0000-8000-8000-000000000005',
  firstRepost: '00000000-0000-8000-8000-000000000006',
  secondRepost: '00000000-0000-8000-8000-000000000007',
  firstConcurrentRepost: '00000000-0000-8000-8000-000000000008',
  secondConcurrentRepost: '00000000-0000-8000-8000-000000000009',
  quote: '00000000-0000-8000-8000-000000000010',
  sourceContent: '00000000-0000-8000-8000-000000000011',
  quoteContent: '00000000-0000-8000-8000-000000000012',
  missingPost: '00000000-0000-8000-8000-000000000099',
};

test('adds the direct Repost Source storage contract without rewriting existing Posts', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const firstConcurrentSql = postgres(process.env.DATABASE_URL, { max: 1 });
  const secondConcurrentSql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of previousMigrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }
    await seedExistingRows(sql);
    const existingRows = [...(await sql`SELECT id::text FROM post ORDER BY id`)];

    await sql.unsafe(await readFile(repostMigration, 'utf8'));

    assert.deepEqual([...(await sql`SELECT id::text FROM post ORDER BY id`)], existingRows);
    assert.deepEqual(
      [
        ...(await sql`
          SELECT id::text, repost_source_id::text AS "repostSourceId"
          FROM post
          ORDER BY id
        `),
      ],
      existingRows.map(({ id }) => ({ id, repostSourceId: null })),
    );
    await verifyCatalog(sql);

    await assert.rejects(
      sql`
        INSERT INTO post (profile_id, visibility, state, repost_source_id)
        VALUES (${ids.author}, 'UNLISTED', 'ACTIVE', ${ids.missingPost})
      `,
      { code: '23503' },
    );

    await sql`
      INSERT INTO post (id, profile_id, visibility, state, repost_source_id)
      VALUES (${ids.firstRepost}, ${ids.author}, 'UNLISTED', 'ACTIVE', ${ids.source})
    `;
    await assert.rejects(
      sql`
        INSERT INTO post (id, profile_id, visibility, state, repost_source_id)
        VALUES (${ids.secondRepost}, ${ids.author}, 'UNLISTED', 'ACTIVE', ${ids.source})
      `,
      { code: '23505' },
    );

    await sql`
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES (${ids.quote}, ${ids.author}, 'PUBLIC', 'ACTIVE')
    `;
    await sql`
      INSERT INTO post_content (id, post_id, document)
      VALUES (${ids.quoteContent}, ${ids.quote}, ${sql.json(postDocument('quote'))})
    `;
    await sql`
      UPDATE post
      SET current_content_id = ${ids.quoteContent}, repost_source_id = ${ids.source}
      WHERE id = ${ids.quote}
    `;

    const concurrentResults = await Promise.allSettled([
      firstConcurrentSql`
        INSERT INTO post (id, profile_id, visibility, state, repost_source_id)
        VALUES (
          ${ids.firstConcurrentRepost},
          ${ids.concurrentAuthor},
          'UNLISTED',
          'ACTIVE',
          ${ids.source}
        )
      `,
      secondConcurrentSql`
        INSERT INTO post (id, profile_id, visibility, state, repost_source_id)
        VALUES (
          ${ids.secondConcurrentRepost},
          ${ids.concurrentAuthor},
          'UNLISTED',
          'ACTIVE',
          ${ids.source}
        )
      `,
    ]);
    assert.equal(concurrentResults.filter(({ status }) => status === 'fulfilled').length, 1);
    const [concurrentFailure] = concurrentResults.filter(({ status }) => status === 'rejected');
    assert.equal(concurrentFailure?.reason.code, '23505');

    await sql`
      UPDATE post
      SET state = 'DELETED', deleted_at = now()
      WHERE id = ${ids.firstRepost}
    `;
    assert.equal(
      (await sql`SELECT repost_source_id::text AS id FROM post WHERE id = ${ids.firstRepost}`)[0]
        ?.id,
      ids.source,
    );
    await sql`
      INSERT INTO post (id, profile_id, visibility, state, repost_source_id)
      VALUES (${ids.secondRepost}, ${ids.author}, 'UNLISTED', 'ACTIVE', ${ids.source})
    `;

    await sql`
      UPDATE post
      SET state = 'DELETED', deleted_at = now()
      WHERE id = ${ids.source}
    `;
    assert.deepEqual(
      [
        ...(await sql`
          SELECT id::text, repost_source_id::text AS "repostSourceId"
          FROM post
          WHERE repost_source_id = ${ids.source}
          ORDER BY id
        `),
      ],
      [
        { id: ids.firstRepost, repostSourceId: ids.source },
        {
          id:
            concurrentResults[0]?.status === 'fulfilled'
              ? ids.firstConcurrentRepost
              : ids.secondConcurrentRepost,
          repostSourceId: ids.source,
        },
        { id: ids.secondRepost, repostSourceId: ids.source },
        { id: ids.quote, repostSourceId: ids.source },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
  } finally {
    await Promise.all([sql.end(), firstConcurrentSql.end(), secondConcurrentSql.end()]);
  }
});

async function verifyCatalog(sql) {
  assert.deepEqual(
    [
      ...(await sql`
        SELECT data_type AS "dataType", is_nullable AS "isNullable"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'post'
          AND column_name = 'repost_source_id'
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
          AND foreign_key.conname = 'post_repost_source_id_post_id_fkey'
      `),
    ],
    [{ referencedTable: 'post', deleteType: 'a' }],
  );

  const indexes = await sql`
    SELECT indexname AS name, indexdef AS definition
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'post'
  `;
  assert.match(
    indexes.find(({ name }) => name === 'post_repost_source_id_index')?.definition ?? '',
    /CREATE INDEX .+ \(repost_source_id\)$/,
  );
  assert.match(
    indexes.find(({ name }) => name === 'post_active_repost_profile_source_unique')?.definition ??
      '',
    /CREATE UNIQUE INDEX .+ \(profile_id, repost_source_id\) WHERE .+state.+ACTIVE.+current_content_id IS NULL.+repost_source_id IS NOT NULL/,
  );
}

async function seedExistingRows(sql) {
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
    ) VALUES
      (${ids.author}, ${ids.instance}, 'ACTIVE', 'author', 'author', 'Author', 'OPEN'),
      (
        ${ids.concurrentAuthor},
        ${ids.instance},
        'ACTIVE',
        'concurrent',
        'concurrent',
        'Concurrent',
        'OPEN'
      )
  `;
  await sql`
    INSERT INTO post (id, profile_id, visibility, state)
    VALUES
      (${ids.source}, ${ids.author}, 'PUBLIC', 'ACTIVE'),
      (${ids.existingPost}, ${ids.author}, 'UNLISTED', 'ACTIVE')
  `;
  await sql`
    INSERT INTO post_content (id, post_id, document)
    VALUES (${ids.sourceContent}, ${ids.source}, ${sql.json(postDocument('source'))})
  `;
  await sql`
    UPDATE post
    SET current_content_id = ${ids.sourceContent}
    WHERE id = ${ids.source}
  `;
}

function postDocument(body) {
  return {
    body: { content: [{ text: body, type: 'text' }], type: 'paragraph' },
    summary: null,
    version: 1,
  };
}
