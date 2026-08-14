import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const ids = {
  activeInstance: '00000000-0000-8000-8000-000000000001',
  suspendedInstance: '00000000-0000-8000-8000-000000000002',
  author: '00000000-0000-8000-8000-000000000003',
  follower: '00000000-0000-8000-8000-000000000004',
  stranger: '00000000-0000-8000-8000-000000000005',
  disabledAuthor: '00000000-0000-8000-8000-000000000006',
  suspendedAuthor: '00000000-0000-8000-8000-000000000007',
  suspendedInstanceAuthor: '00000000-0000-8000-8000-000000000008',
  account: '00000000-0000-8000-8000-000000000009',
  follow: '00000000-0000-8000-8000-000000000010',
  publicPost: '00000000-0000-8000-8000-000000000011',
  unlistedPost: '00000000-0000-8000-8000-000000000012',
  followersPost: '00000000-0000-8000-8000-000000000013',
  directPost: '00000000-0000-8000-8000-000000000014',
  tombstonePost: '00000000-0000-8000-8000-000000000015',
  disabledPost: '00000000-0000-8000-8000-000000000016',
  suspendedPost: '00000000-0000-8000-8000-000000000017',
  suspendedInstancePost: '00000000-0000-8000-8000-000000000018',
  publicContent: '00000000-0000-8000-8000-000000000021',
  unlistedContent: '00000000-0000-8000-8000-000000000022',
  followersContent: '00000000-0000-8000-8000-000000000023',
  directContent: '00000000-0000-8000-8000-000000000024',
  tombstoneContent: '00000000-0000-8000-8000-000000000025',
  disabledContent: '00000000-0000-8000-8000-000000000026',
  suspendedContent: '00000000-0000-8000-8000-000000000027',
  suspendedInstanceContent: '00000000-0000-8000-8000-000000000028',
  dmlPost: '00000000-0000-8000-8000-000000000031',
  dmlContent: '00000000-0000-8000-8000-000000000032',
  deniedPost: '00000000-0000-8000-8000-000000000033',
  deniedContent: '00000000-0000-8000-8000-000000000034',
};

const visiblePostIds = {
  anonymous: [ids.publicPost, ids.unlistedPost],
  accountOnly: [ids.publicPost, ids.unlistedPost],
  empty: [ids.publicPost, ids.unlistedPost],
  malformed: [ids.publicPost, ids.unlistedPost],
  author: [ids.publicPost, ids.unlistedPost, ids.followersPost, ids.directPost, ids.tombstonePost],
  follower: [ids.publicPost, ids.unlistedPost, ids.followersPost],
  stranger: [ids.publicPost, ids.unlistedPost],
};

const contentForPost = new Map([
  [ids.publicPost, ids.publicContent],
  [ids.unlistedPost, ids.unlistedContent],
  [ids.followersPost, ids.followersContent],
  [ids.directPost, ids.directContent],
  [ids.tombstonePost, ids.tombstoneContent],
  [ids.disabledPost, ids.disabledContent],
  [ids.suspendedPost, ids.suspendedContent],
  [ids.suspendedInstancePost, ids.suspendedInstanceContent],
]);

test('enforces GraphQL Post/PostContent RLS on an isolated PostgreSQL database', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await applyAllMigrations(sql);
    await seedRows(sql);

    await verifyCatalog(sql);
    await verifyViewerMatrix(sql);
    await verifyDmlMatrix(sql);
    await verifyBypassRoles(sql);
    await verifyPlanAndIndexes(sql);
  } finally {
    await sql.end();
  }
});

async function applyAllMigrations(sql) {
  const drizzleDirectory = new URL('../../../drizzle/', import.meta.url);
  const entries = await readdir(drizzleDirectory, { withFileTypes: true });

  for (const entry of entries
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const migration = new URL(`../../../drizzle/${entry.name}/migration.sql`, import.meta.url);
    await sql.unsafe(await readFile(migration, 'utf8'));
  }
}

async function seedRows(sql) {
  await sql`
    INSERT INTO instance (id, domain, kind, state)
    VALUES
      (${ids.activeInstance}, 'local.test', 'LOCAL', 'ACTIVE'),
      (${ids.suspendedInstance}, 'suspended.test', 'LOCAL', 'SUSPENDED')
  `;

  await sql`
    INSERT INTO account (id, oidc_subject, display_name, state)
    VALUES (${ids.account}, 'rls-test-account', 'RLS Test Account', 'ACTIVE')
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
      (${ids.author}, ${ids.activeInstance}, 'ACTIVE', 'author', 'author', 'Author', 'OPEN'),
      (${ids.follower}, ${ids.activeInstance}, 'ACTIVE', 'follower', 'follower', 'Follower', 'OPEN'),
      (${ids.stranger}, ${ids.activeInstance}, 'ACTIVE', 'stranger', 'stranger', 'Stranger', 'OPEN'),
      (${ids.disabledAuthor}, ${ids.activeInstance}, 'DISABLED', 'disabled', 'disabled', 'Disabled', 'OPEN'),
      (${ids.suspendedAuthor}, ${ids.activeInstance}, 'SUSPENDED', 'suspended', 'suspended', 'Suspended', 'OPEN'),
      (
        ${ids.suspendedInstanceAuthor},
        ${ids.suspendedInstance},
        'ACTIVE',
        'remote-suspended',
        'remote-suspended',
        'Suspended Instance Author',
        'OPEN'
      )
  `;

  await sql`
    INSERT INTO account_profile (id, account_id, profile_id, role)
    VALUES (${ids.account}, ${ids.account}, ${ids.author}, 'OWNER')
  `;

  await sql`
    INSERT INTO profile_follow (id, follower_profile_id, followee_profile_id)
    VALUES (${ids.follow}, ${ids.follower}, ${ids.author})
  `;

  await sql`
    INSERT INTO post (id, profile_id, visibility, state, deleted_at)
    VALUES
      (${ids.publicPost}, ${ids.author}, 'PUBLIC', 'ACTIVE', NULL),
      (${ids.unlistedPost}, ${ids.author}, 'UNLISTED', 'ACTIVE', NULL),
      (${ids.followersPost}, ${ids.author}, 'FOLLOWERS', 'ACTIVE', NULL),
      (${ids.directPost}, ${ids.author}, 'DIRECT', 'ACTIVE', NULL),
      (${ids.tombstonePost}, ${ids.author}, 'PUBLIC', 'DELETED', now()),
      (${ids.disabledPost}, ${ids.disabledAuthor}, 'PUBLIC', 'ACTIVE', NULL),
      (${ids.suspendedPost}, ${ids.suspendedAuthor}, 'PUBLIC', 'ACTIVE', NULL),
      (${ids.suspendedInstancePost}, ${ids.suspendedInstanceAuthor}, 'PUBLIC', 'ACTIVE', NULL)
  `;

  await sql`
    INSERT INTO post_content (id, post_id, document)
    VALUES
      (${ids.publicContent}, ${ids.publicPost}, ${sql.json(postDocument('public'))}),
      (${ids.unlistedContent}, ${ids.unlistedPost}, ${sql.json(postDocument('unlisted'))}),
      (${ids.followersContent}, ${ids.followersPost}, ${sql.json(postDocument('followers'))}),
      (${ids.directContent}, ${ids.directPost}, ${sql.json(postDocument('direct'))}),
      (${ids.tombstoneContent}, ${ids.tombstonePost}, ${sql.json(postDocument('tombstone'))}),
      (${ids.disabledContent}, ${ids.disabledPost}, ${sql.json(postDocument('disabled'))}),
      (${ids.suspendedContent}, ${ids.suspendedPost}, ${sql.json(postDocument('suspended'))}),
      (
        ${ids.suspendedInstanceContent},
        ${ids.suspendedInstancePost},
        ${sql.json(postDocument('suspended instance'))}
      )
  `;

  for (const [postId, contentId] of contentForPost) {
    await sql`
      UPDATE post
      SET current_content_id = ${contentId}
      WHERE id = ${postId}
    `;
  }
}

async function verifyCatalog(sql) {
  assert.deepEqual(
    [
      ...(await sql`
        SELECT
          c.relname AS name,
          c.relrowsecurity AS rls,
          c.relforcerowsecurity AS force_rls
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname IN ('post', 'post_content')
        ORDER BY c.relname
      `),
    ],
    [
      { name: 'post', rls: true, force_rls: false },
      { name: 'post_content', rls: true, force_rls: false },
    ],
  );

  const policies = [
    ...(await sql`
      SELECT
        tablename AS "tableName",
        policyname AS "policyName",
        cmd,
        roles::text[] AS roles
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('post', 'post_content')
      ORDER BY tablename, policyname
    `),
  ];

  assert.ok(policies.length > 0);
  for (const policy of policies) {
    assert.deepEqual(policy.roles, ['kosmo_api'], `${policy.tableName}.${policy.policyName}`);
  }

  const policyCommands = new Map();
  for (const tableName of ['post', 'post_content']) {
    policyCommands.set(
      tableName,
      new Set(
        policies.filter((policy) => policy.tableName === tableName).map((policy) => policy.cmd),
      ),
    );
  }
  assert.deepEqual(policyCommands.get('post'), new Set(['SELECT', 'INSERT', 'UPDATE']));
  assert.deepEqual(policyCommands.get('post_content'), new Set(['SELECT', 'INSERT']));
}

async function verifyViewerMatrix(sql) {
  const contexts = [
    ['anonymous', {}],
    ['accountOnly', { accountId: ids.account }],
    ['empty', { profileId: '' }],
    ['malformed', { profileId: 'not-a-uuid' }],
    ['author', { profileId: ids.author }],
    ['follower', { profileId: ids.follower }],
    ['stranger', { profileId: ids.stranger }],
  ];

  for (const [name, context] of contexts) {
    const visible = await selectVisibleRows(sql, context);
    const expectedPosts = visiblePostIds[name];
    const expectedContents = expectedPosts.map((postId) => contentForPost.get(postId));

    assert.deepEqual(visible.postIds, expectedPosts.toSorted(), `${name} Post viewer matrix`);
    assert.deepEqual(
      visible.contentIds,
      expectedContents.toSorted(),
      `${name} PostContent viewer matrix`,
    );
  }

  const directContent = await selectRowsById(sql, { profileId: ids.stranger }, ids.directContent);
  assert.deepEqual(
    directContent,
    [],
    'a stranger cannot fetch a DIRECT PostContent by physical ID',
  );

  const authorDirectContent = await selectRowsById(
    sql,
    { profileId: ids.author },
    ids.directContent,
  );
  assert.deepEqual(authorDirectContent, [ids.directContent]);

  const followerTombstone = await selectRowsById(
    sql,
    { profileId: ids.follower },
    ids.tombstonePost,
  );
  assert.deepEqual(followerTombstone, [], 'only the author can see a Post Tombstone');

  const authorTombstone = await selectRowsById(sql, { profileId: ids.author }, ids.tombstonePost);
  assert.deepEqual(authorTombstone, [ids.tombstonePost]);
}

async function selectVisibleRows(sql, context) {
  return sql.begin(async (tx) => {
    await setApiRole(tx, context);
    const posts = await tx`SELECT id::text AS id FROM post ORDER BY id`;
    const contents = await tx`SELECT id::text AS id FROM post_content ORDER BY id`;
    return {
      postIds: posts.map(({ id }) => id),
      contentIds: contents.map(({ id }) => id),
    };
  });
}

async function selectRowsById(sql, context, id) {
  return sql.begin(async (tx) => {
    await setApiRole(tx, context);
    const rows = await tx`SELECT id::text AS id FROM post WHERE id = ${id}`;
    const contents = await tx`SELECT id::text AS id FROM post_content WHERE id = ${id}`;
    return [...rows, ...contents].map(({ id: rowId }) => rowId);
  });
}

async function verifyDmlMatrix(sql) {
  await sql.begin(async (tx) => {
    await setApiRole(tx, { profileId: ids.author });

    const skeleton = [
      ...(await tx`
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES (${ids.dmlPost}, ${ids.author}, 'PUBLIC', 'ACTIVE')
      RETURNING id::text AS id, current_content_id AS "currentContentId"
    `),
    ];
    assert.deepEqual(skeleton, [{ id: ids.dmlPost, currentContentId: null }]);

    const content = [
      ...(await tx`
      INSERT INTO post_content (id, post_id, document)
      VALUES (${ids.dmlContent}, ${ids.dmlPost}, ${sql.json(postDocument('dml'))})
      RETURNING id::text AS id
    `),
    ];
    assert.deepEqual(content, [{ id: ids.dmlContent }]);

    const linked = [
      ...(await tx`
      UPDATE post
      SET current_content_id = ${ids.dmlContent}
      WHERE id = ${ids.dmlPost} AND profile_id = ${ids.author}
      RETURNING id::text AS id, current_content_id AS "currentContentId", state
    `),
    ];
    assert.deepEqual(linked, [
      { id: ids.dmlPost, currentContentId: ids.dmlContent, state: 'ACTIVE' },
    ]);

    const tombstone = [
      ...(await tx`
      UPDATE post
      SET state = 'DELETED', deleted_at = now()
      WHERE id = ${ids.dmlPost}
        AND profile_id = ${ids.author}
        AND state = 'ACTIVE'
      RETURNING id::text AS id, current_content_id AS "currentContentId", state
    `),
    ];
    assert.deepEqual(tombstone, [
      { id: ids.dmlPost, currentContentId: ids.dmlContent, state: 'DELETED' },
    ]);
  });

  await expectDenied(sql, { profileId: ids.stranger }, async (tx) => {
    return tx`
      INSERT INTO post (id, profile_id, visibility, state)
      VALUES (${ids.deniedPost}, ${ids.author}, 'PUBLIC', 'ACTIVE')
    `;
  });

  for (const context of [
    {},
    { accountId: ids.account },
    { profileId: '' },
    { profileId: 'not-a-uuid' },
  ]) {
    await expectDenied(sql, context, async (tx) => {
      return tx`
        INSERT INTO post (id, profile_id, visibility, state)
        VALUES (${ids.deniedPost}, ${ids.author}, 'PUBLIC', 'ACTIVE')
      `;
    });
  }

  await expectDenied(sql, { profileId: ids.stranger }, async (tx) => {
    return tx`
      UPDATE post
      SET current_content_id = ${ids.publicContent}
      WHERE id = ${ids.publicPost}
      RETURNING id
    `;
  });

  await expectDenied(sql, { profileId: ids.author }, async (tx) => {
    return tx`DELETE FROM post WHERE id = ${ids.publicPost} RETURNING id`;
  });

  for (const context of [
    {},
    { accountId: ids.account },
    { profileId: '' },
    { profileId: 'not-a-uuid' },
  ]) {
    await expectDenied(sql, context, async (tx) => {
      return tx`
        INSERT INTO post_content (id, post_id, document)
        VALUES (${ids.deniedContent}, ${ids.publicPost}, ${sql.json(postDocument('denied'))})
      `;
    });
  }

  await expectDenied(sql, { profileId: ids.author }, async (tx) => {
    return tx`
      UPDATE post_content
      SET document = ${sql.json(postDocument('mutated'))}
      WHERE id = ${ids.publicContent}
      RETURNING id
    `;
  });

  await expectDenied(sql, { profileId: ids.author }, async (tx) => {
    return tx`DELETE FROM post_content WHERE id = ${ids.publicContent} RETURNING id`;
  });
}

async function expectDenied(sql, context, operation) {
  try {
    const rows = await sql.begin(async (tx) => {
      await setApiRole(tx, context);
      return operation(tx);
    });
    assert.equal(
      [...rows].length,
      0,
      'a denied UPDATE/DELETE must affect no rows; a denied INSERT must fail',
    );
  } catch (error) {
    if (error?.code !== '42501') {
      throw error;
    }
  }
}

async function verifyBypassRoles(sql) {
  const ownerCounts = await sql`
    SELECT
      (SELECT count(*)::int FROM post) AS "postCount",
      (SELECT count(*)::int FROM post_content) AS "contentCount"
  `;
  assert.equal(ownerCounts[0]?.postCount, 9);
  assert.equal(ownerCounts[0]?.contentCount, 9);

  const workerCounts = await sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL ROLE kosmo_worker');
    return [
      ...(await tx`
      SELECT
        current_user AS "currentUser",
        (SELECT count(*)::int FROM post) AS "postCount",
        (SELECT count(*)::int FROM post_content) AS "contentCount"
    `),
    ];
  });
  assert.deepEqual(workerCounts, [{ currentUser: 'kosmo_worker', postCount: 9, contentCount: 9 }]);

  const roles = [
    ...(await sql`
      SELECT rolname, rolsuper AS "super", rolbypassrls AS "bypassRls"
      FROM pg_roles
      WHERE rolname IN ('kosmo_api', 'kosmo_worker')
      ORDER BY rolname
    `),
  ];
  assert.deepEqual(roles, [
    { rolname: 'kosmo_api', super: false, bypassRls: false },
    { rolname: 'kosmo_worker', super: false, bypassRls: true },
  ]);
}

async function verifyPlanAndIndexes(sql) {
  const indexes = [
    ...(await sql`
      SELECT indexname AS name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('post', 'post_content', 'profile_follow')
    `),
  ];

  assert.ok(indexes.some(({ name }) => name === 'post_content_post_id_index'));
  assert.ok(
    indexes.some(
      ({ name, definition }) =>
        name === 'post_profile_id_id_index' &&
        /profile_id/.test(definition) &&
        /id/.test(definition),
    ),
  );
  assert.ok(
    indexes.some(
      ({ definition }) =>
        /follower_profile_id/.test(definition) && /followee_profile_id/.test(definition),
    ),
  );

  const plan = await sql.begin(async (tx) => {
    await setApiRole(tx, { profileId: ids.author });
    await tx.unsafe('SET LOCAL enable_seqscan = off');
    return tx`
      EXPLAIN (FORMAT JSON, COSTS OFF, SUMMARY OFF)
      SELECT id
      FROM post_content
      WHERE post_id = ${ids.publicPost}
    `;
  });
  const planText = JSON.stringify(plan);
  assert.match(planText, /post_content_post_id_index/);
  assert.match(planText, /Plan/);
}

async function setApiRole(tx, { accountId, profileId } = {}) {
  await tx.unsafe('SET LOCAL ROLE kosmo_api');
  await tx.unsafe('RESET kosmo.account_id; RESET kosmo.profile_id;');
  if (accountId !== undefined) {
    await tx`SELECT set_config('kosmo.account_id', ${accountId}, true)`;
  }
  if (profileId !== undefined) {
    await tx`SELECT set_config('kosmo.profile_id', ${profileId}, true)`;
  }
}

function postDocument(text) {
  return {
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  };
}
