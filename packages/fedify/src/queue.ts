import { PostgresMessageQueue } from '@fedify/postgres';
import postgres from 'postgres';
import type { Sql } from 'postgres';

const mode = process.env.FEDIFY_RUNTIME_MODE?.trim() || 'direct';

if (mode !== 'direct' && mode !== 'producer' && mode !== 'consumer') {
  throw new Error('FEDIFY_RUNTIME_MODE must be one of direct, producer, or consumer.');
}

const queueDatabaseUrl = process.env.FEDIFY_QUEUE_DATABASE_URL?.trim();
const queueDatabasePassword = process.env.FEDIFY_QUEUE_DATABASE_PASSWORD;
let queueSql: Sql | undefined;

if (mode !== 'direct') {
  if (!queueDatabaseUrl) {
    throw new Error(`FEDIFY_QUEUE_DATABASE_URL is required when FEDIFY_RUNTIME_MODE=${mode}.`);
  }

  let url: URL;
  try {
    url = new URL(queueDatabaseUrl);
  } catch {
    throw new Error(
      `FEDIFY_QUEUE_DATABASE_URL must be a valid PostgreSQL URL when FEDIFY_RUNTIME_MODE=${mode}.`,
    );
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(
      `FEDIFY_QUEUE_DATABASE_URL must use postgres:// or postgresql:// when FEDIFY_RUNTIME_MODE=${mode}.`,
    );
  }
  if (!queueDatabasePassword && !url.password) {
    throw new Error(
      `FEDIFY_QUEUE_DATABASE_PASSWORD is required unless FEDIFY_QUEUE_DATABASE_URL embeds a password when FEDIFY_RUNTIME_MODE=${mode}.`,
    );
  }

  queueSql = postgres(
    queueDatabaseUrl,
    queueDatabasePassword ? { password: queueDatabasePassword } : undefined,
  );
}

export const fedifyQueue = queueSql ? new PostgresMessageQueue(queueSql) : undefined;

export const closeFedifyQueue = async (): Promise<void> => {
  await queueSql?.end({ timeout: 5 });
};
