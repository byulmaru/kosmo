import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const previousMigrationNames = [
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
  '20260729014146_jazzy_silvermane',
  '20260730113348_prod_581_media_representation',
  '20260730140803_conscious_viper',
  '20260730153759_prod_492_profile_media',
  '20260731012813_prod_585_remote_media',
  '20260731091619_prod_625_remote_profile_media',
  '20260731103508_prod_627_remote_url_identity_contract',
  '20260804071405_prod_648_profile_default_visibility',
  '20260804120000_prod_321_follow_request_notification',
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));

const baseMigration = new URL(
  '../../../drizzle/20260807100000_prod_370_post_rls_base/migration.sql',
  import.meta.url,
);

const ids = {
  instance: '00000000-0000-8000-8000-000000000001',
  author: '00000000-0000-8000-8000-000000000002',
  viewer: '00000000-0000-8000-8000-000000000003',
  source: '00000000-0000-8000-8000-000000000004',
  sourceContent: '00000000-0000-8000-8000-000000000005',
  repost: '00000000-0000-8000-8000-000000000006',
  existingPost: '00000000-0000-8000-8000-000000000007',
  existingContent: '00000000-0000-8000-8000-000000000008',
  ownerPost: '00000000-0000-8000-8000-000000000009',
  ownerContent: '00000000-0000-8000-8000-00000000000a',
  nonOwnerPost: '00000000-0000-8000-8000-00000000000b',
};

test('adds the Post/PostContent RLS base and validates its independent contracts', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const nonOwnerRole = `post_rls_base_${process.pid}_${Date.now()}`;
  let nonOwnerSql;
  let roleCreated = false;

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of previousMigrationNames) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }
    await seedRows(sql);

    const rowsBefore = await postRows(sql);
    const indexesBefore = await relevantIndexes(sql);

    await sql.unsafe(await readFile(baseMigration, 'utf8'));

    await verifyRlsCatalog(sql);
    await verifyOwnerWorkload(sql, rowsBefore);
    await verifyHelpers(sql);
    await verifyIndexesAndPlans(sql, indexesBefore);

    await sql`CREATE ROLE ${sql(nonOwnerRole)}`;
    roleCreated = true;
    await sql`GRANT USAGE ON SCHEMA public TO ${sql(nonOwnerRole)}`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE post, post_content TO ${sql(nonOwnerRole)}`;
    const [roleCatalog] = await sql`
      SELECT rolsuper AS "isSuperuser", rolbypassrls AS "bypassesRls"
      FROM pg_roles
      WHERE rolname = ${nonOwnerRole}
    `;
    assert.deepEqual(roleCatalog, { isSuperuser: false, bypassesRls: false });

    nonOwnerSql = postgres(process.env.DATABASE_URL, { max: 1 });
    await nonOwnerSql`SET ROLE ${nonOwnerSql(nonOwnerRole)}`;
    await verifyNonOwnerFailClosed(nonOwnerSql);
  } finally {
    if (nonOwnerSql) {
      await nonOwnerSql.end({ timeout: 5 });
    }
    if (roleCreated) {
      await sql`DROP OWNED BY ${sql(nonOwnerRole)}`;
      await sql`DROP ROLE ${sql(nonOwnerRole)}`;
    }
    await sql.end({ timeout: 5 });
  }
});

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
    ) VALUES
      (${ids.author}, ${ids.instance}, 'ACTIVE', 'author', 'author', 'Author', 'OPEN'),
      (${ids.viewer}, ${ids.instance}, 'ACTIVE', 'viewer', 'viewer', 'Viewer', 'OPEN')
  `;
  await sql`
    INSERT INTO post (id, profile_id, visibility, state)
    VALUES
      (${ids.source}, ${ids.author}, 'PUBLIC', 'ACTIVE'),
      (${ids.existingPost}, ${ids.author}, 'UNLISTED', 'ACTIVE')
  `;
  await sql`
    INSERT INTO post_content (id, post_id, document)
    VALUES
      (${ids.sourceContent}, ${ids.source}, ${sql.json(postDocument('source'))}),
      (${ids.existingContent}, ${ids.existingPost}, ${sql.json(postDocument('existing'))})
  `;
  await sql`
    UPDATE post
    SET current_content_id = CASE id
      WHEN ${ids.source}::uuid THEN ${ids.sourceContent}::uuid
      WHEN ${ids.existingPost}::uuid THEN ${ids.existingContent}::uuid
    END
    WHERE id IN (${ids.source}, ${ids.existingPost})
  `;
  await sql`
    INSERT INTO post (id, profile_id, visibility, state, repost_source_id)
    VALUES (${ids.repost}, ${ids.viewer}, 'UNLISTED', 'ACTIVE', ${ids.source})
  `;
  await sql`
    INSERT INTO profile_follow (follower_profile_id, followee_profile_id)
    VALUES (${ids.viewer}, ${ids.author})
  `;
}

async function verifyRlsCatalog(sql) {
  assert.deepEqual(
    Array.from(
      await sql`
      SELECT
        relname AS "tableName",
        relrowsecurity AS "rlsEnabled",
        relforcerowsecurity AS "forceRls",
        (
          SELECT count(*)::int
          FROM pg_policy
          WHERE polrelid = relation.oid
        ) AS "policyCount"
      FROM pg_class AS relation
      WHERE relation.oid IN ('public.post'::regclass, 'public.post_content'::regclass)
      ORDER BY relname
    `,
    ),
    [
      { tableName: 'post', rlsEnabled: true, forceRls: false, policyCount: 0 },
      { tableName: 'post_content', rlsEnabled: true, forceRls: false, policyCount: 0 },
    ],
  );

  const [session] = await sql`SELECT current_user AS "currentUser"`;
  const owners = await sql`
    SELECT relation.relname AS "tableName", pg_get_userbyid(relation.relowner) AS owner
    FROM pg_class AS relation
    WHERE relation.oid IN ('public.post'::regclass, 'public.post_content'::regclass)
    ORDER BY relation.relname
  `;
  assert.deepEqual(
    owners.map(({ tableName, owner }) => ({ tableName, owner })),
    [
      { tableName: 'post', owner: session.currentUser },
      { tableName: 'post_content', owner: session.currentUser },
    ],
  );

  const functions = await sql`
    SELECT
      procedure.proname AS name,
      pg_get_function_result(procedure.oid) AS "resultType",
      procedure.provolatile AS volatility,
      procedure.proparallel AS parallel,
      procedure.prosecdef AS "securityDefiner",
      pg_get_functiondef(procedure.oid) AS definition
    FROM pg_proc AS procedure
    INNER JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN ('kosmo_current_account_id', 'kosmo_current_profile_id')
    ORDER BY procedure.proname
  `;
  assert.equal(functions.length, 2);
  assert.deepEqual(
    functions.map(({ name, resultType, volatility, parallel, securityDefiner }) => ({
      name,
      resultType,
      volatility,
      parallel,
      securityDefiner,
    })),
    [
      {
        name: 'kosmo_current_account_id',
        resultType: 'uuid',
        volatility: 's',
        parallel: 's',
        securityDefiner: false,
      },
      {
        name: 'kosmo_current_profile_id',
        resultType: 'uuid',
        volatility: 's',
        parallel: 's',
        securityDefiner: false,
      },
    ],
  );
  for (const fn of functions) {
    assert.match(fn.definition, /pg_catalog\.current_setting/);
    assert.match(fn.definition, /pg_catalog\.regexp_like/);
  }
}

async function verifyOwnerWorkload(sql, rowsBefore) {
  assert.deepEqual(await postRows(sql), rowsBefore);
  assert.equal(
    (
      await sql`SELECT count(*)::int AS count FROM post_content WHERE post_id = ${ids.existingPost}`
    )[0]?.count,
    1,
  );

  await sql`
    INSERT INTO post (id, profile_id, visibility, state)
    VALUES (${ids.ownerPost}, ${ids.author}, 'PUBLIC', 'ACTIVE')
  `;
  await sql`
    INSERT INTO post_content (id, post_id, document)
    VALUES (${ids.ownerContent}, ${ids.ownerPost}, ${sql.json(postDocument('owner'))})
  `;
  await sql`
    UPDATE post
    SET current_content_id = ${ids.ownerContent}, visibility = 'UNLISTED'
    WHERE id = ${ids.ownerPost}
  `;
  await sql`
    UPDATE post_content
    SET document = ${sql.json(postDocument('owner-updated'))}
    WHERE id = ${ids.ownerContent}
  `;
  assert.equal(
    (
      await sql`
        SELECT visibility, document->'content'->0->'content'->0->>'text' AS text
        FROM post
        INNER JOIN post_content ON post_content.id = post.current_content_id
        WHERE post.id = ${ids.ownerPost}
      `
    )[0]?.visibility,
    'UNLISTED',
  );
  assert.equal(
    (
      await sql`
        SELECT document->'content'->0->'content'->0->>'text' AS text
        FROM post_content
        WHERE id = ${ids.ownerContent}
      `
    )[0]?.text,
    'owner-updated',
  );

  await sql`UPDATE post SET current_content_id = NULL WHERE id = ${ids.ownerPost}`;
  await sql`DELETE FROM post_content WHERE id = ${ids.ownerContent}`;
  await sql`DELETE FROM post WHERE id = ${ids.ownerPost}`;
  assert.equal(
    (await sql`SELECT count(*)::int AS count FROM post WHERE id = ${ids.ownerPost}`)[0]?.count,
    0,
  );
}

async function verifyHelpers(sql) {
  const helperCases = [
    {
      setting: 'kosmo.account_id',
      functionName: 'public.kosmo_current_account_id',
      valid: ids.author,
    },
    {
      setting: 'kosmo.profile_id',
      functionName: 'public.kosmo_current_profile_id',
      valid: ids.viewer,
    },
  ];

  for (const { setting, functionName, valid } of helperCases) {
    assert.equal(await readHelper(sql, setting, functionName), null, `${setting} missing`);
    assert.equal(await readHelper(sql, setting, functionName, ''), null, `${setting} empty`);
    assert.equal(
      await readHelper(sql, setting, functionName, 'not-a-uuid'),
      null,
      `${setting} invalid`,
    );
    assert.equal(await readHelper(sql, setting, functionName, valid), valid, `${setting} valid`);

    assert.equal(
      await readHelper(sql, setting, functionName),
      null,
      `${setting} must not preserve an actor value after the transaction`,
    );
  }
}

async function readHelper(sql, setting, functionName, value) {
  const result = await sql.begin(async (transaction) => {
    if (value !== undefined) {
      await transaction`
        SELECT pg_catalog.set_config(${setting}, ${value}, true)
      `;
    }
    const [row] = await transaction.unsafe(`SELECT ${functionName}()::text AS value`);
    return row?.value ?? null;
  });
  return result;
}

async function verifyIndexesAndPlans(sql, indexesBefore) {
  const indexesAfter = await relevantIndexes(sql);
  assert.deepEqual(indexesAfter, indexesBefore, 'RLS base must not add speculative indexes');

  const expectedIndexes = [
    'post_content_post_id_index',
    'post_profile_id_id_index',
    'profile_follow_follower_profile_id_followee_profile_id_unique',
  ];
  for (const indexName of expectedIndexes) {
    assert.ok(
      indexesAfter.some(({ name }) => name === indexName),
      `expected existing index ${indexName}`,
    );
  }
  assert.equal(
    indexesAfter.some(({ name }) => name === 'post_repost_source_id_index'),
    false,
    'source lookup must reuse post primary key instead of adding a standalone FK index',
  );

  await sql`SET enable_seqscan = off`;
  try {
    await assertPlanIndexes(
      sql,
      'Post -> Profile -> Instance author lookup',
      ['post_profile_id_id_index', 'profile_pkey', 'instance_pkey'],
      () => sql`
        EXPLAIN (FORMAT JSON)
        SELECT post.id, profile.id, instance.id
        FROM post
        INNER JOIN profile ON profile.id = post.profile_id
        INNER JOIN instance ON instance.id = profile.instance_id
        WHERE post.profile_id = ${ids.author}
          AND profile.id = ${ids.author}
          AND instance.id = ${ids.instance}
      `,
    );
    await assertPlanIndexes(
      sql,
      'Post Content -> Post parent lookup',
      ['post_content_post_id_index', 'post_pkey'],
      () => sql`
        EXPLAIN (FORMAT JSON)
        SELECT post.id, post_content.id
        FROM post_content
        INNER JOIN post ON post.id = post_content.post_id
        WHERE post_content.post_id = ${ids.source}
      `,
    );
    await assertPlanIndexes(
      sql,
      'viewer -> author established Follow lookup',
      ['profile_follow_follower_profile_id_followee_profile_id_unique'],
      () => sql`
        EXPLAIN (FORMAT JSON)
        SELECT id
        FROM profile_follow
        WHERE follower_profile_id = ${ids.viewer}
          AND followee_profile_id = ${ids.author}
      `,
    );
    await assertPlanIndexes(
      sql,
      'Repost Source Post lookup',
      ['post_pkey'],
      () => sql`
        EXPLAIN (FORMAT JSON)
        SELECT source.id
        FROM post AS repost
        INNER JOIN post AS source ON source.id = repost.repost_source_id
        WHERE repost.id = ${ids.repost}
      `,
    );
  } finally {
    await sql`RESET enable_seqscan`;
  }
}

async function assertPlanIndexes(sql, description, expectedIndexes, query) {
  const result = await query();
  const plan = result[0]?.['QUERY PLAN']?.[0]?.Plan;
  assert.ok(plan, `${description} must return a JSON plan`);
  const usedIndexes = new Set();
  collectPlanIndexes(plan, usedIndexes);
  for (const indexName of expectedIndexes) {
    assert.ok(usedIndexes.has(indexName), `${description} must use ${indexName}`);
  }
}

function collectPlanIndexes(node, indexes) {
  if (node['Index Name']) {
    indexes.add(node['Index Name']);
  }
  for (const child of node.Plans ?? []) {
    collectPlanIndexes(child, indexes);
  }
}

async function verifyNonOwnerFailClosed(sql) {
  assert.equal((await sql`SELECT count(*)::int AS count FROM post`)[0]?.count, 0);
  assert.equal((await sql`SELECT count(*)::int AS count FROM post_content`)[0]?.count, 0);

  await assertDmlDenied(
    () => sql`
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES (${ids.nonOwnerPost}, ${ids.viewer}, 'PUBLIC', 'ACTIVE')
      RETURNING id
    `,
    'Post INSERT',
  );
  await assertDmlDenied(
    () => sql`UPDATE post SET visibility = 'PUBLIC' WHERE id = ${ids.source} RETURNING id`,
    'Post UPDATE',
  );
  await assertDmlDenied(
    () => sql`DELETE FROM post WHERE id = ${ids.source} RETURNING id`,
    'Post DELETE',
  );
  await assertDmlDenied(
    () => sql`
      INSERT INTO post_content (id, post_id, document)
      VALUES (${ids.nonOwnerPost}, ${ids.source}, ${sql.json(postDocument('blocked'))})
      RETURNING id
    `,
    'Post Content INSERT',
  );
  await assertDmlDenied(
    () =>
      sql`UPDATE post_content SET document = ${sql.json(postDocument('blocked'))} WHERE id = ${ids.sourceContent} RETURNING id`,
    'Post Content UPDATE',
  );
  await assertDmlDenied(
    () => sql`DELETE FROM post_content WHERE id = ${ids.sourceContent} RETURNING id`,
    'Post Content DELETE',
  );
}

async function assertDmlDenied(query, description) {
  try {
    const result = await query();
    assert.equal(result.length, 0, `${description} must not affect rows`);
  } catch (error) {
    assert.equal(error.code, '42501', `${description} must fail with row-level security`);
  }
}

async function postRows(sql) {
  return Array.from(
    await sql`
      SELECT
        id::text,
        profile_id::text AS "profileId",
        visibility,
        state,
        current_content_id::text AS "currentContentId"
      FROM post
      ORDER BY id
    `,
  );
}

async function relevantIndexes(sql) {
  return Array.from(
    await sql`
      SELECT tablename AS "tableName", indexname AS name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('post', 'post_content', 'profile', 'instance', 'profile_follow')
      ORDER BY tablename, indexname
    `,
  );
}

function postDocument(text) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}
