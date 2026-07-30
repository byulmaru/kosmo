import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const restorePointPattern = /^[A-Za-z0-9._-]{1,63}$/;
const walPattern = /^[0-9A-F]{24}$/;

export function isWalArchived(targetWal: string, archivedThroughWal: string | null): boolean {
  if (!walPattern.test(targetWal) || !archivedThroughWal || !walPattern.test(archivedThroughWal)) {
    return false;
  }
  return BigInt(`0x${archivedThroughWal}`) >= BigInt(`0x${targetWal}`);
}

export async function createContractRestorePoint({
  databaseUrl = process.env.DATABASE_URL,
  name = process.env.RESTORE_POINT_NAME,
  timeoutMs = Number(process.env.RESTORE_POINT_ARCHIVE_TIMEOUT_MS ?? 10 * 60 * 1000),
  pollIntervalMs = 5 * 1000,
}: {
  databaseUrl?: string;
  name?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
} = {}): Promise<{
  name: string;
  createdAt: string;
  targetLsn: string;
  targetWal: string;
  archivedThroughWal: string;
}> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create a contract restore point.');
  }
  if (!name || !restorePointPattern.test(name)) {
    throw new Error(
      'RESTORE_POINT_NAME must contain 1-63 letters, digits, dots, underscores, or dashes.',
    );
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('RESTORE_POINT_ARCHIVE_TIMEOUT_MS must be a positive number.');
  }

  const client = postgres(databaseUrl, {
    max: 1,
    connection: {
      idle_in_transaction_session_timeout: 30 * 1000,
      lock_timeout: 10 * 1000,
      statement_timeout: 30 * 1000,
    },
  });

  try {
    const [restorePoint] = await client<
      { createdAt: Date; targetLsn: string; targetWal: string }[]
    >`
      WITH restore_point AS (
        SELECT pg_create_restore_point(${name}) AS target_lsn
      )
      SELECT
        clock_timestamp() AS "createdAt",
        target_lsn::text AS "targetLsn",
        pg_walfile_name(target_lsn) AS "targetWal"
      FROM restore_point
    `;
    if (!restorePoint || !walPattern.test(restorePoint.targetWal)) {
      throw new Error('PostgreSQL did not return a valid restore point WAL.');
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const [archiver] = await client<{ archivedThroughWal: string | null }[]>`
        SELECT last_archived_wal AS "archivedThroughWal"
        FROM pg_stat_archiver
      `;
      const archivedThroughWal = archiver?.archivedThroughWal ?? null;
      if (archivedThroughWal && isWalArchived(restorePoint.targetWal, archivedThroughWal)) {
        return {
          name,
          createdAt: restorePoint.createdAt.toISOString(),
          targetLsn: restorePoint.targetLsn,
          targetWal: restorePoint.targetWal,
          archivedThroughWal,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error('Timed out waiting for the contract restore point WAL to be archived.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypointUrl === import.meta.url) {
  const result = await createContractRestorePoint();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
