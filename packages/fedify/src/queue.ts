import { PostgresMessageQueue } from '@fedify/postgres';
import postgres from 'postgres';
import type { Sql } from 'postgres';

const queueDatabaseUrl = process.env.FEDIFY_QUEUE_DATABASE_URL?.trim();
const queueSql: Sql | undefined = queueDatabaseUrl
  ? postgres(queueDatabaseUrl, {
      password: process.env.FEDIFY_QUEUE_DATABASE_PASSWORD,
    })
  : undefined;

export const fedifyQueue = queueSql ? new PostgresMessageQueue(queueSql) : undefined;

export const closeFedifyQueue = async (): Promise<void> => {
  await queueSql?.end({ timeout: 5 });
};
