import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { postContentDocumentFromText } from '../post-content/server';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for post mention backfill integration tests.');
}

const database = postgres(databaseUrl, { max: 1 });
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const backfillEntrypoint = fileURLToPath(
  new URL('./backfill-current-post-mentions.ts', import.meta.url),
);
const plainTextDocument = JSON.stringify(postContentDocumentFromText('plain text'));

type BackfillResult = {
  readonly dryRun: boolean;
  readonly selected: number;
  readonly updated: number;
  readonly hasMore: boolean;
};

type MentionRow = {
  readonly postContentId: string;
  readonly profileId: string;
  readonly postId: string | null;
};

type MentionSeed = {
  readonly profileId: string;
  readonly marked?: boolean;
};

type ContentVersionSeed = {
  readonly mentions: readonly MentionSeed[];
};

const invokeBackfill = (args: readonly string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', backfillEntrypoint, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: process.env,
  });

const runBackfill = (args: readonly string[]): BackfillResult => {
  const result = invokeBackfill(args);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');

  const output = JSON.parse(result.stdout) as BackfillResult;
  assert.deepEqual(Object.keys(output).sort(), ['dryRun', 'hasMore', 'selected', 'updated']);
  return output;
};

const createProfile = async (): Promise<string> => {
  const id = randomUUID();
  const instanceId = randomUUID();
  const handle = `backfill-${id}`;

  await database`
    INSERT INTO instance (id, domain, kind)
    VALUES (${instanceId}, ${`${id}.example`}, 'LOCAL')
  `;
  await database`
    INSERT INTO profile (id, instance_id, handle, normalized_handle, display_name, follow_policy)
    VALUES (${id}, ${instanceId}, ${handle}, ${handle}, ${handle}, 'OPEN')
  `;

  return id;
};

const createPostWithVersions = async (
  authorProfileId: string,
  versions: readonly ContentVersionSeed[],
) => {
  const postId = randomUUID();
  const contentIds: string[] = [];

  await database`
    INSERT INTO post (id, profile_id, visibility, state)
    VALUES (${postId}, ${authorProfileId}, 'PUBLIC', 'ACTIVE')
  `;

  for (const { mentions } of versions) {
    const postContentId = randomUUID();
    contentIds.push(postContentId);

    await database`
      INSERT INTO post_content (id, post_id, document)
      VALUES (${postContentId}, ${postId}, ${plainTextDocument}::jsonb)
    `;

    for (const { profileId, marked = false } of mentions) {
      await database`
        INSERT INTO post_mentions (post_content_id, profile_id, post_id)
        VALUES (${postContentId}, ${profileId}, ${marked ? postId : null})
      `;
    }
  }

  const currentContentId = contentIds.at(-1);
  assert.ok(currentContentId);
  await database`
    UPDATE post SET current_content_id = ${currentContentId} WHERE id = ${postId}
  `;

  return { postId, contentIds };
};

const readMentions = async (contentIds: readonly string[]): Promise<MentionRow[]> =>
  database<MentionRow[]>`
    SELECT
      post_content_id::text AS "postContentId",
      profile_id::text AS "profileId",
      post_id::text AS "postId"
    FROM post_mentions
    WHERE post_content_id = ANY(${database.array([...contentIds])}::uuid[])
    ORDER BY post_content_id, profile_id
  `;

test.after(() => database.end({ timeout: 5 }));

test('backfills one bounded batch from current relations and reruns by remaining eligibility', async () => {
  const authorProfileId = await createProfile();
  const currentOnlyProfileId = await createProfile();
  const historicalOnlyProfileId = await createProfile();
  const previouslyMarkedProfileId = await createProfile();

  const legacyPost = await createPostWithVersions(authorProfileId, [
    {
      mentions: [
        { profileId: historicalOnlyProfileId },
        { profileId: previouslyMarkedProfileId, marked: true },
      ],
    },
    {
      mentions: [{ profileId: currentOnlyProfileId }, { profileId: previouslyMarkedProfileId }],
    },
  ]);

  const batchPosts = [];

  for (let index = 0; index < 3; index++) {
    const recipientProfileId = await createProfile();
    const post = await createPostWithVersions(authorProfileId, [
      { mentions: [{ profileId: recipientProfileId }] },
    ]);
    batchPosts.push({ ...post, recipientProfileId });
  }

  const contentIds = [
    ...legacyPost.contentIds,
    ...batchPosts.flatMap(({ contentIds }) => contentIds),
  ];
  const beforeDryRun = await readMentions(contentIds);

  assert.deepEqual(runBackfill(['--batch-size', '2']), {
    dryRun: true,
    selected: 2,
    updated: 0,
    hasMore: true,
  });
  assert.deepEqual(await readMentions(contentIds), beforeDryRun);

  assert.deepEqual(runBackfill(['--apply', '--batch-size', '2']), {
    dryRun: false,
    selected: 2,
    updated: 2,
    hasMore: true,
  });
  assert.deepEqual(runBackfill(['--apply', '--batch-size', '2']), {
    dryRun: false,
    selected: 2,
    updated: 2,
    hasMore: false,
  });

  const afterBackfill = await readMentions(contentIds);
  const rowFor = (postContentId: string, profileId: string) =>
    afterBackfill.find((row) => row.postContentId === postContentId && row.profileId === profileId);

  assert.equal(
    rowFor(legacyPost.contentIds[0]!, historicalOnlyProfileId)?.postId,
    null,
    'historical-only membership stays unmarked',
  );
  assert.equal(
    rowFor(legacyPost.contentIds[1]!, currentOnlyProfileId)?.postId,
    legacyPost.postId,
    'a current relation-only identity is marked from the relation row',
  );
  assert.equal(
    rowFor(legacyPost.contentIds[0]!, previouslyMarkedProfileId)?.postId,
    legacyPost.postId,
    'the earlier-revision marker stays in place',
  );
  assert.equal(
    rowFor(legacyPost.contentIds[1]!, previouslyMarkedProfileId)?.postId,
    null,
    'an existing post/profile marker prevents a duplicate current marker',
  );

  for (const { contentIds: postContentIds, postId, recipientProfileId } of batchPosts) {
    assert.equal(rowFor(postContentIds[0]!, recipientProfileId)?.postId, postId);
  }

  assert.deepEqual(runBackfill(['--apply', '--batch-size', '2']), {
    dryRun: false,
    selected: 0,
    updated: 0,
    hasMore: false,
  });
  assert.deepEqual(await readMentions(contentIds), afterBackfill);
});

test('rejects invalid batch CLI options before connecting to the database', () => {
  for (const args of [
    ['--batch-size', '0'],
    ['--batch-size', '10001'],
    ['--batch-size'],
    ['--unexpected'],
  ]) {
    const result = invokeBackfill(args);
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Usage: pnpm --filter @kosmo\/core backfill:post-mentions/);
  }
});
