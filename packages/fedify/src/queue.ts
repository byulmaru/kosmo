import { PostgresMessageQueue } from '@fedify/postgres';
import postgres from 'postgres';
import type { Sql } from 'postgres';

export type FedifyRuntimeMode = 'direct' | 'producer' | 'consumer';

export interface FedifyRuntimeConfig {
  readonly mode: FedifyRuntimeMode;
  readonly queueDatabaseUrl?: string;
  readonly queueDatabasePassword?: string;
}

export class FedifyRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FedifyRuntimeConfigurationError';
  }
}

/**
 * Read the runtime mode and queue connection boundary without consulting any
 * other database environment variable.  Queue mode is deliberately explicit:
 * a queue URL by itself never enables the producer or consumer.
 */
export const readFedifyRuntimeConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): FedifyRuntimeConfig => {
  const rawMode = environment.FEDIFY_RUNTIME_MODE;
  const mode = rawMode === undefined ? 'direct' : rawMode.trim();

  if (mode !== 'direct' && mode !== 'producer' && mode !== 'consumer') {
    throw new FedifyRuntimeConfigurationError(
      'FEDIFY_RUNTIME_MODE must be one of direct, producer, or consumer.',
    );
  }

  const queueDatabaseUrl = environment.FEDIFY_QUEUE_DATABASE_URL?.trim();
  const queueDatabasePassword = environment.FEDIFY_QUEUE_DATABASE_PASSWORD;

  if (mode !== 'direct' && !queueDatabaseUrl) {
    throw new FedifyRuntimeConfigurationError(
      `FEDIFY_QUEUE_DATABASE_URL is required when FEDIFY_RUNTIME_MODE=${mode}.`,
    );
  }

  if (mode !== 'direct' && queueDatabaseUrl) {
    validateQueueDatabaseCredentials(queueDatabaseUrl, queueDatabasePassword, mode);
  }

  return {
    mode,
    ...(queueDatabaseUrl ? { queueDatabaseUrl } : {}),
    ...(queueDatabasePassword ? { queueDatabasePassword } : {}),
  };
};

export interface FedifyQueueRuntime {
  readonly config: FedifyRuntimeConfig;
  readonly queue: PostgresMessageQueue | undefined;
  readonly sql: Sql | undefined;
}

/**
 * Build the one queue connection shared by inbox, outbox and fan-out.  The
 * adapter owns initialization and schema; this package only creates the
 * connection and passes it to Fedify.
 */
export const createFedifyQueueRuntime = (
  config: FedifyRuntimeConfig = readFedifyRuntimeConfig(),
): FedifyQueueRuntime => {
  if (config.mode === 'direct') {
    return { config, queue: undefined, sql: undefined };
  }

  if (!config.queueDatabaseUrl) {
    throw new FedifyRuntimeConfigurationError(
      `FEDIFY_QUEUE_DATABASE_URL is required when FEDIFY_RUNTIME_MODE=${config.mode}.`,
    );
  }

  validateQueueDatabaseCredentials(
    config.queueDatabaseUrl,
    config.queueDatabasePassword,
    config.mode,
  );

  const sql = postgres(
    config.queueDatabaseUrl,
    config.queueDatabasePassword ? { password: config.queueDatabasePassword } : undefined,
  );
  // Keep initialized at the adapter default (`false`) so the official adapter
  // performs its idempotent initialization on the first enqueue/listen.
  const queue = new PostgresMessageQueue(sql);
  return { config, queue, sql };
};

const runtime = createFedifyQueueRuntime();

export const fedifyRuntimeConfig = runtime.config;
export const fedifyQueue = runtime.queue;
export const fedifyQueueSql = runtime.sql;

export const closeFedifyQueue = async (): Promise<void> => {
  await fedifyQueueSql?.end({ timeout: 5 });
};

function validateQueueDatabaseCredentials(
  value: string,
  password: string | undefined,
  mode: Exclude<FedifyRuntimeMode, 'direct'>,
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FedifyRuntimeConfigurationError(
      `FEDIFY_QUEUE_DATABASE_URL must be a valid PostgreSQL URL when FEDIFY_RUNTIME_MODE=${mode}.`,
    );
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new FedifyRuntimeConfigurationError(
      `FEDIFY_QUEUE_DATABASE_URL must use postgres:// or postgresql:// when FEDIFY_RUNTIME_MODE=${mode}.`,
    );
  }

  // A password may be supplied separately so it never needs to be rendered in
  // a URL.  If no override is present, require one embedded in the URL rather
  // than silently falling back to DATABASE_PASSWORD/PGPASSWORD.
  if (!password && !url.password) {
    throw new FedifyRuntimeConfigurationError(
      `FEDIFY_QUEUE_DATABASE_PASSWORD is required unless FEDIFY_QUEUE_DATABASE_URL embeds a password when FEDIFY_RUNTIME_MODE=${mode}.`,
    );
  }
}
