import postgres from 'postgres';

const defaultBatchSize = 500;
const maximumBatchSize = 10_000;
const usage =
  'Usage: pnpm --filter @kosmo/core backfill:post-mentions [--apply] [--batch-size <1..10000>]';

type Options = {
  readonly dryRun: boolean;
  readonly batchSize: number;
};

type BackfillSummary = {
  readonly selected: number;
  readonly updated: number;
  readonly hasMore: boolean;
};

type BackfillResult = BackfillSummary & {
  readonly dryRun: boolean;
};

const parseArgs = (args: string[]): Options => {
  let apply = false;
  let batchSize = defaultBatchSize;
  let batchSizeProvided = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    if (argument === '--apply') {
      if (apply) {
        throw new Error(`--apply may only be provided once.\n${usage}`);
      }

      apply = true;
      continue;
    }

    if (argument === '--batch-size') {
      if (batchSizeProvided) {
        throw new Error(`--batch-size may only be provided once.\n${usage}`);
      }

      const value = args[index + 1];

      if (value === undefined || !/^[1-9]\d*$/.test(value)) {
        throw new Error(`--batch-size must be a positive integer.\n${usage}`);
      }

      const parsedBatchSize = Number(value);

      if (!Number.isSafeInteger(parsedBatchSize) || parsedBatchSize > maximumBatchSize) {
        throw new Error(`--batch-size must be at most ${maximumBatchSize}.\n${usage}`);
      }

      batchSize = parsedBatchSize;
      batchSizeProvided = true;
      index++;
      continue;
    }

    throw new Error(`Unknown option: ${argument}\n${usage}`);
  }

  return { dryRun: !apply, batchSize };
};

const hasPostMentionMarkerConflict = (cause: unknown): boolean => {
  if (typeof cause !== 'object' || cause === null) {
    return false;
  }

  const error = cause as { code?: unknown; constraint_name?: unknown };
  return (
    error.code === '23505' && error.constraint_name === 'post_mentions_post_id_profile_id_unique'
  );
};

const requireDatabaseEnvironment = (): string | undefined => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    const requiredEnvironment = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
    const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

    if (missingEnvironment.length > 0) {
      throw new Error(
        `DATABASE_URL or PostgreSQL environment is required; missing ${missingEnvironment.join(', ')}.`,
      );
    }
  }

  return databaseUrl;
};

const runBackfill = async ({ dryRun, batchSize }: Options): Promise<BackfillResult> => {
  const databaseUrl = requireDatabaseEnvironment();
  const clientOptions = { max: 1, max_lifetime: null };
  const sql = databaseUrl ? postgres(databaseUrl, clientOptions) : postgres(clientOptions);

  try {
    let summary: BackfillSummary;

    if (dryRun) {
      const candidates = await sql<{ readonly eligible: number }[]>`
        SELECT 1 AS eligible
        FROM post_mentions AS mention
        JOIN post AS post ON post.current_content_id = mention.post_content_id
        WHERE mention.post_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM post_mentions AS marker
            WHERE marker.post_id = post.id
              AND marker.profile_id = mention.profile_id
          )
        ORDER BY post.id, mention.profile_id, mention.post_content_id
        LIMIT ${batchSize + 1}
      `;

      summary = {
        selected: Math.min(candidates.length, batchSize),
        updated: 0,
        hasMore: candidates.length > batchSize,
      };
    } else {
      const [row] = await sql<BackfillSummary[]>`
        WITH candidates AS MATERIALIZED (
          SELECT
            mention.post_content_id,
            mention.profile_id,
            post.id AS post_id
          FROM post_mentions AS mention
          JOIN post AS post ON post.current_content_id = mention.post_content_id
          WHERE mention.post_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM post_mentions AS marker
              WHERE marker.post_id = post.id
                AND marker.profile_id = mention.profile_id
            )
          ORDER BY post.id, mention.profile_id, mention.post_content_id
          LIMIT ${batchSize + 1}
        ), batch AS MATERIALIZED (
          SELECT post_content_id, profile_id, post_id
          FROM candidates
          ORDER BY post_id, profile_id, post_content_id
          LIMIT ${batchSize}
        ), updated AS (
          UPDATE post_mentions AS mention
          SET post_id = batch.post_id
          FROM batch
          WHERE mention.post_content_id = batch.post_content_id
            AND mention.profile_id = batch.profile_id
            AND mention.post_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM post_mentions AS marker
              WHERE marker.post_id = batch.post_id
                AND marker.profile_id = batch.profile_id
            )
          RETURNING 1
        )
        SELECT
          (SELECT count(*)::integer FROM batch) AS selected,
          (SELECT count(*)::integer FROM updated) AS updated,
          (SELECT count(*) > ${batchSize} FROM candidates) AS "hasMore"
      `;

      if (!row) {
        throw new Error('Post mention backfill did not return a batch summary.');
      }

      summary = row;
    }

    return { dryRun, ...summary };
  } catch (cause) {
    if (hasPostMentionMarkerConflict(cause)) {
      throw new Error(
        'A PostMentions marker was added concurrently; this batch was rolled back. Rerun the command to continue.',
        { cause },
      );
    }

    throw cause;
  } finally {
    await sql.end({ timeout: 5 });
  }
};

const main = async (args: string[]): Promise<void> => {
  const options = parseArgs(args);
  const result = await runBackfill(options);
  console.log(JSON.stringify(result));
};

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
