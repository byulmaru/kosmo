import { createClient } from '@redis/client';
import type { RedisClientType } from '@redis/client';

const connectTimeoutMs = 500;
const commandTimeoutMs = 250;

let redisClient: RedisClientType | undefined;

function logRedisError(error: unknown): void {
  console.error('Redis client error', {
    name: error instanceof Error ? error.name : 'UnknownError',
  });
}

function resetRedisClient(client: RedisClientType): void {
  if (redisClient !== client) {
    return;
  }

  redisClient = undefined;
  try {
    client.destroy();
  } catch (error) {
    logRedisError(error);
  }
}

function createRedisClient(url: string): RedisClientType {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: connectTimeoutMs, reconnectStrategy: false },
  });
  client.on('error', logRedisError);
  client.unref();
  return client;
}

export async function runRedisCommand<T>(
  command: (client: RedisClientType) => Promise<T>,
): Promise<{ value: T } | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return null;
  }

  let client: RedisClientType;
  try {
    client = redisClient ??= createRedisClient(url);
  } catch (error) {
    logRedisError(error);
    return null;
  }

  if (!client.isReady) {
    if (!client.isOpen) {
      void client.connect().catch(() => {
        if (redisClient === client && !client.isReady) {
          resetRedisClient(client);
        }
      });
    }
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve()
        .then(() => command(client))
        .then((value) => ({ type: 'value' as const, value })),
      new Promise<{ type: 'timeout' }>((resolve) => {
        timer = setTimeout(() => resolve({ type: 'timeout' }), commandTimeoutMs);
      }),
    ]);

    if (result.type === 'timeout') {
      resetRedisClient(client);
      return null;
    }

    return { value: result.value };
  } catch {
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
