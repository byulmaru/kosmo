import { createPubSub } from '@graphql-yoga/subscription';
import { createClient } from '@redis/client';
import type { PubSub, PubSubEventTarget } from '@graphql-yoga/subscription';

type PubSubTopicMap = {
  [topic: string]: [] | [unknown] | [string | number, unknown];
};

type RedisListener = (message: string, channel: string) => void;

function logRedisPubSubError(error: unknown): void {
  console.error('Redis PubSub error', {
    name: error instanceof Error ? error.name : 'UnknownError',
  });
}

export function createRedisPubSub<TPubSubPublishArgsByKey extends PubSubTopicMap>(
  url: string,
): {
  pubSub: PubSub<TPubSubPublishArgsByKey>;
  dispose: () => void;
} {
  const publisher = createClient({ url, disableOfflineQueue: true });
  const subscriber = createClient({ url });
  function monitorRedisClient(client: typeof publisher): void {
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
  monitorRedisClient(publisher);
  monitorRedisClient(subscriber);

  void publisher.connect().catch(() => undefined);
  void subscriber.connect().catch(() => undefined);

  const redisListeners = new WeakMap<object, Map<string, RedisListener>>();
  const eventTarget = {
    addEventListener(topic: string, callback: EventListenerOrEventListenerObject | null) {
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

      void subscriber.subscribe(topic, redisListener).catch(() => undefined);
    },
    dispatchEvent(event: Event) {
      let message: string | undefined;
      try {
        message = JSON.stringify({ detail: (event as CustomEvent<unknown>).detail });
      } catch (error) {
        logRedisPubSubError(error);
        return true;
      }
      if (message !== undefined) {
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
      void subscriber.unsubscribe(topic, redisListener).catch(() => undefined);
    },
  } as PubSubEventTarget<TPubSubPublishArgsByKey>;

  let disposed = false;
  return {
    pubSub: createPubSub<TPubSubPublishArgsByKey>({ eventTarget }),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        publisher.destroy();
      } catch (error) {
        logRedisPubSubError(error);
      }
      try {
        subscriber.destroy();
      } catch (error) {
        logRedisPubSubError(error);
      }
    },
  };
}
