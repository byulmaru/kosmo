import { createClient } from '@redis/client';
import type { RedisClientType } from '@redis/client';

const connectTimeoutMs = 500;
const commandTimeoutMs = 250;

type RunRedisCommandOptions = {
  readonly waitForReady?: boolean;
};

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

function waitUntilRedisClientReady(client: RedisClientType): Promise<boolean> {
  if (client.isReady) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(onTimeout, connectTimeoutMs);
    client.once('ready', onReady);

    if (!client.isOpen) {
      try {
        void client.connect().catch(() => {
          if (redisClient === client && !client.isReady) {
            resetRedisClient(client);
          }
          finish(false);
        });
      } catch {
        if (redisClient === client && !client.isReady) {
          resetRedisClient(client);
        }
        finish(false);
      }
    }

    function cleanup() {
      client.off('ready', onReady);
      clearTimeout(timer);
    }

    function finish(ready: boolean) {
      cleanup();
      resolve(ready);
    }

    function onReady() {
      finish(true);
    }

    function onTimeout() {
      finish(false);
    }
  });
}

export async function runRedisCommand<T>(
  command: (client: RedisClientType) => Promise<T>,
  { waitForReady = false }: RunRedisCommandOptions = {},
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
    if (waitForReady) {
      if (!(await waitUntilRedisClientReady(client))) {
        return null;
      }
    } else {
      if (!client.isOpen) {
        void client.connect().catch(() => {
          if (redisClient === client && !client.isReady) {
            resetRedisClient(client);
          }
        });
      }
      return null;
    }
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
