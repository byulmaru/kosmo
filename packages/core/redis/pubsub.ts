import { createClient } from '@redis/client';
import type { PubSubEventTarget } from '@graphql-yoga/subscription';
import type { RedisClientType } from '@redis/client';

type PubSubTopicMap = {
  [topic: string]: [] | [unknown] | [string | number, unknown];
};

type RedisListener = (message: string, channel: string) => void;

function logRedisPubSubError(error: unknown): void {
  console.error('Redis PubSub error', {
    name: error instanceof Error ? error.name : 'UnknownError',
  });
}

let attemptedConnection = false;
let disposed = false;
let publisher: RedisClientType | undefined;
let subscriber: RedisClientType | undefined;
const redisListeners = new WeakMap<object, Map<string, RedisListener>>();

function initializeRedisClients(): void {
  if (attemptedConnection || disposed) {
    return;
  }
  attemptedConnection = true;

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return;
  }

  try {
    const nextPublisher = createClient({ url, disableOfflineQueue: true });
    const nextSubscriber = createClient({ url });

    function monitorRedisClient(client: RedisClientType): void {
      let hasLoggedError = false;
      client.on('error', (error) => {
        if (hasLoggedError) {
          return;
        }
        hasLoggedError = true;
        logRedisPubSubError(error);
      });
      client.on('ready', () => {
        hasLoggedError = false;
      });
    }

    monitorRedisClient(nextPublisher);
    monitorRedisClient(nextSubscriber);
    publisher = nextPublisher;
    subscriber = nextSubscriber;

    void nextPublisher.connect().catch(() => undefined);
    void nextSubscriber.connect().catch(() => undefined);
  } catch (error) {
    logRedisPubSubError(error);
  }
}

export const redisEventTarget: PubSubEventTarget<PubSubTopicMap> = {
  addEventListener(topic: string, callback: EventListenerOrEventListenerObject | null) {
    initializeRedisClients();
    if (callback === null) {
      return;
    }

    let listenersByTopic = redisListeners.get(callback);
    if (listenersByTopic === undefined) {
      listenersByTopic = new Map();
      redisListeners.set(callback, listenersByTopic);
    }

    let redisListener = listenersByTopic.get(topic);
    if (redisListener === undefined) {
      redisListener = (message, channel) => {
        let detail: unknown;
        try {
          detail = (JSON.parse(message) as { detail?: unknown }).detail;
        } catch (error) {
          logRedisPubSubError(error);
          return;
        }

        const event = new CustomEvent(channel, { detail });
        if (typeof callback === 'function') {
          callback(event);
        } else {
          callback.handleEvent(event);
        }
      };
      listenersByTopic.set(topic, redisListener);
    }

    void subscriber?.subscribe(topic, redisListener).catch(() => undefined);
  },
  dispatchEvent(event: Event) {
    initializeRedisClients();

    let message: string | undefined;
    try {
      message = JSON.stringify({ detail: (event as CustomEvent<unknown>).detail });
    } catch (error) {
      logRedisPubSubError(error);
    }
    if (message !== undefined && publisher !== undefined) {
      void publisher.publish(event.type, message).catch(() => undefined);
    }
    return true;
  },
  removeEventListener(topic: string, callback: EventListenerOrEventListenerObject | null) {
    if (callback === null) {
      return;
    }

    const listenersByTopic = redisListeners.get(callback);
    const redisListener = listenersByTopic?.get(topic);
    if (redisListener === undefined || listenersByTopic === undefined) {
      return;
    }

    listenersByTopic.delete(topic);
    if (listenersByTopic.size === 0) {
      redisListeners.delete(callback);
    }
    void subscriber?.unsubscribe(topic, redisListener).catch(() => undefined);
  },
};

export function disposeRedisPubSub(): void {
  if (disposed) {
    return;
  }
  disposed = true;

  try {
    publisher?.destroy();
  } catch (error) {
    logRedisPubSubError(error);
  }
  try {
    subscriber?.destroy();
  } catch (error) {
    logRedisPubSubError(error);
  }
}
