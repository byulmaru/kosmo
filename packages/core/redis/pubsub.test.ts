import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { connect, createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createPubSub } from '@graphql-yoga/subscription';
import { createClient } from '@redis/client';
import { disposeRedisPubSub, redisEventTarget } from './pubsub.ts';
import type { Socket } from 'node:net';
import type { PubSub } from '@graphql-yoga/subscription';
import type { RedisClientType } from '@redis/client';

type Events = {
  [topic: `test:redis:empty:${string}`]: [];
  'test:redis:control': [id: string, payload: { value: string }];
  'test:redis:event': [id: string, payload: { value: string }];
  'test:redis:other': [id: string, payload: { value: string }];
  'test:redis:replay': [id: string, payload: { value: string }];
};

type RedisProxyConnection = {
  client: Socket;
  upstream: Socket;
  closed: boolean;
  close: () => void;
};

type RedisPeerMessage = {
  type: string;
  name?: string;
  requestId?: string;
  value?: unknown;
};

type RedisPeerCommand =
  | { type: 'publish-other'; requestId: string; value: string }
  | { type: 'dispose' };

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;

async function waitForSubscriberCount(
  redis: RedisClientType,
  channel: string,
  count: number,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const subscriberCounts = await redis.pubSubNumSub(channel);
    if ((subscriberCounts[channel] ?? 0) === count) {
      return;
    }
    await delay(25);
  }
  assert.equal((await redis.pubSubNumSub(channel))[channel] ?? 0, count);
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), 5_000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function nextValue<T>(iterator: AsyncIterator<T>): Promise<T> {
  const result = await withTimeout(iterator.next(), 'Redis Pub/Sub event was not delivered');
  assert.equal(result.done, false);
  return result.value;
}

async function assertPending<T>(promise: Promise<T>): Promise<void> {
  const pending = Symbol('pending');
  assert.equal(await Promise.race([promise, delay(75).then(() => pending)]), pending);
}

async function createRedisProxy(redisUrl: string) {
  const target = new URL(redisUrl);
  assert.equal(target.protocol, 'redis:');
  let blocked = false;
  let closed = false;
  const connections: RedisProxyConnection[] = [];
  const server = createServer((client) => {
    if (blocked) {
      client.destroy();
      return;
    }

    const upstream = connect({ host: target.hostname, port: Number(target.port || 6379) });
    const connection: RedisProxyConnection = {
      client,
      upstream,
      closed: false,
      close() {
        if (connection.closed) {
          return;
        }
        connection.closed = true;
        client.destroy();
        upstream.destroy();
      },
    };
    connections.push(connection);

    client.on('close', connection.close);
    upstream.on('close', connection.close);
    client.on('error', connection.close);
    upstream.on('error', connection.close);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const proxyUrl = new URL(redisUrl);
  proxyUrl.hostname = '127.0.0.1';
  proxyUrl.port = String(address.port);

  return {
    url: proxyUrl.toString(),
    setBlocked(value: boolean) {
      blocked = value;
    },
    disconnectAll() {
      for (const connection of connections) {
        connection.close();
      }
    },
    get activeConnectionCount() {
      return connections.filter((connection) => !connection.closed).length;
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const connection of connections) {
        connection.close();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

type RedisProxy = Awaited<ReturnType<typeof createRedisProxy>>;

async function waitForProxyConnectionCount(proxy: RedisProxy, count: number): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    if (proxy.activeConnectionCount === count) {
      return;
    }
    await delay(25);
  }
  assert.equal(proxy.activeConnectionCount, count);
}

function startRedisPeer(redisUrl: string, id: string) {
  const child = fork(`${import.meta.dirname}/pubsub.test-peer.ts`, {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, REDIS_URL: redisUrl, KOSMO_PUBSUB_TEST_ID: id },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const messages: RedisPeerMessage[] = [];
  child.on('message', (message: unknown) => messages.push(message as RedisPeerMessage));

  function waitForMessage(
    predicate: (message: RedisPeerMessage) => boolean,
    message: string,
  ): Promise<RedisPeerMessage> {
    const existing = messages.find(predicate);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.off('message', onMessage);
        reject(new Error(message));
      }, 5_000);
      const onMessage = (message: unknown) => {
        const peerMessage = message as RedisPeerMessage;
        if (predicate(peerMessage)) {
          clearTimeout(timer);
          child.off('message', onMessage);
          resolve(peerMessage);
        }
      };
      child.on('message', onMessage);
      const raced = messages.find(predicate);
      if (raced !== undefined) {
        clearTimeout(timer);
        child.off('message', onMessage);
        resolve(raced);
      }
    });
  }

  let resolveExit!: (code: number | null) => void;
  const exited = new Promise<number | null>((resolve) => {
    resolveExit = resolve;
  });
  child.once('exit', (code) => resolveExit(code));
  let closing: Promise<void> | undefined;

  return {
    child,
    messages,
    waitForMessage,
    send(message: RedisPeerCommand) {
      child.send(message);
    },
    async close() {
      closing ??= (async () => {
        if (child.exitCode === null && child.signalCode === null) {
          const disposed = waitForMessage(
            (message) => message.type === 'disposed',
            'Redis Pub/Sub peer did not dispose',
          );
          child.send({ type: 'dispose' });
          try {
            await disposed;
          } catch {
            child.kill('SIGTERM');
          }
        }
        const code = await withTimeout(exited, 'Redis Pub/Sub peer did not exit');
        assert.equal(code, 0);
      })();
      return closing;
    },
  };
}

type RedisPeer = ReturnType<typeof startRedisPeer>;

type ObservedRedisMessage = { channel: string; detail: unknown };

async function waitForObservedDetail(
  messages: ObservedRedisMessage[],
  channel: string,
  value: string,
): Promise<{ value: string }> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const message = messages.find(
      (item) =>
        item.channel === channel &&
        typeof item.detail === 'object' &&
        item.detail !== null &&
        'value' in item.detail &&
        item.detail.value === value,
    );
    if (message !== undefined) {
      assert.deepEqual(message.detail, { value });
      return message.detail as { value: string };
    }
    await delay(25);
  }
  assert.fail(`Redis Pub/Sub observer did not receive ${value}`);
}

async function publishUntilObserved(
  pubSub: PubSub<Events>,
  messages: ObservedRedisMessage[],
  channel: string,
  id: string,
  value: string,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    pubSub.publish('test:redis:control', id, { value });
    await delay(25);
    if (
      messages.some(
        (message) =>
          message.channel === channel &&
          typeof message.detail === 'object' &&
          message.detail !== null &&
          'value' in message.detail &&
          message.detail.value === value,
      )
    ) {
      return;
    }
  }
  assert.fail('Redis Pub/Sub publisher did not become ready');
}

test('leaves the transport unavailable without REDIS_URL', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `const [{ createPubSub }, { redisEventTarget, disposeRedisPubSub }] = await Promise.all([
        import('@graphql-yoga/subscription'),
        import('./pubsub.ts'),
      ]);
      const pubSub = createPubSub({ eventTarget: redisEventTarget });
      pubSub.publish('test:redis:event', 'id', { value: 'dropped' });
      const iterator = pubSub.subscribe('test:redis:event', 'id');
      void iterator.next();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await iterator.return();
      disposeRedisPubSub();`,
    ],
    {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      env: { ...process.env, REDIS_URL: '' },
      timeout: 3_000,
    },
  );

  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test(
  'shares one Redis client pair across Yoga consumers and independent processes',
  { skip: !testRedisUrl },
  async (t) => {
    const previousRedisUrl = process.env.REDIS_URL;
    const proxy = await createRedisProxy(testRedisUrl!);
    proxy.setBlocked(true);
    const redis = createClient({ url: testRedisUrl! });
    const observer = createClient({ url: testRedisUrl! });
    redis.on('error', () => undefined);
    observer.on('error', () => undefined);

    const id = randomUUID();
    const controlChannel = `test:redis:control:${id}`;
    const eventChannel = `test:redis:event:${id}`;
    const otherChannel = `test:redis:other:${id}`;
    const replayChannel = `test:redis:replay:${id}`;
    const emptyTopic: `test:redis:empty:${string}` = `test:redis:empty:${id}`;
    const observedMessages: ObservedRedisMessage[] = [];
    const iterators: AsyncIterator<unknown>[] = [];
    const peerRef: { current?: RedisPeer } = {};

    t.after(async () => {
      try {
        if (peerRef.current !== undefined) {
          await peerRef.current.close();
        }
      } finally {
        await Promise.allSettled(iterators.map((iterator) => iterator.return?.()));
        disposeRedisPubSub();
        await observer.unsubscribe(controlChannel).catch(() => undefined);
        await observer.unsubscribe(replayChannel).catch(() => undefined);
        await Promise.allSettled([redis.close(), observer.close()]);
        await proxy.close();
        if (previousRedisUrl === undefined) {
          delete process.env.REDIS_URL;
        } else {
          process.env.REDIS_URL = previousRedisUrl;
        }
      }
    });

    await Promise.all([redis.connect(), observer.connect()]);
    await observer.subscribe(controlChannel, (message, channel) => {
      observedMessages.push({
        channel,
        detail: (JSON.parse(message) as { detail?: unknown }).detail,
      });
    });
    await waitForSubscriberCount(redis, controlChannel, 1);

    process.env.REDIS_URL = ` ${proxy.url} `;
    const publisher = createPubSub<Events>({ eventTarget: redisEventTarget });
    const secondConsumer = createPubSub<Events>({ eventTarget: redisEventTarget });

    publisher.publish('test:redis:control', id, { value: 'before-initial-readiness' });
    await delay(75);
    assert.equal(
      observedMessages.some(
        (message) =>
          (message.detail as { value?: string } | null)?.value === 'before-initial-readiness',
      ),
      false,
    );

    proxy.setBlocked(false);
    await waitForProxyConnectionCount(proxy, 2);
    await publishUntilObserved(publisher, observedMessages, controlChannel, id, 'publisher-ready');
    const control = secondConsumer.subscribe('test:redis:control', id);
    iterators.push(control);
    const controlNext = nextValue(control);
    await waitForSubscriberCount(redis, controlChannel, 2);
    await publishUntilObserved(publisher, observedMessages, controlChannel, id, 'subscriber-ready');
    assert.deepEqual(await controlNext, { value: 'subscriber-ready' });
    assert.equal(
      observedMessages.some(
        (message) =>
          (message.detail as { value?: string } | null)?.value === 'before-initial-readiness',
      ),
      false,
    );
    const firstLocalEvent = publisher.subscribe('test:redis:event', id);
    const secondLocalEvent = secondConsumer.subscribe('test:redis:event', id);
    const otherLocalEvent = secondConsumer.subscribe('test:redis:other', id);
    const emptyLocalEvent = secondConsumer.subscribe(emptyTopic);
    iterators.push(firstLocalEvent, secondLocalEvent, otherLocalEvent, emptyLocalEvent);
    const firstLocalNext = firstLocalEvent.next();
    const secondLocalNext = secondLocalEvent.next();
    const otherPending = otherLocalEvent.next();
    const emptyLocalNext = emptyLocalEvent.next();
    await Promise.all([
      waitForSubscriberCount(redis, eventChannel, 1),
      waitForSubscriberCount(redis, otherChannel, 1),
      waitForSubscriberCount(redis, emptyTopic, 1),
    ]);

    const peer = startRedisPeer(proxy.url, id);
    peerRef.current = peer;
    await peer.waitForMessage((message) => message.type === 'ready', 'Redis peer did not start');
    await Promise.all([
      waitForSubscriberCount(redis, eventChannel, 2),
      waitForProxyConnectionCount(proxy, 4),
    ]);

    await observer.subscribe(replayChannel, (message, channel) => {
      observedMessages.push({
        channel,
        detail: (JSON.parse(message) as { detail?: unknown }).detail,
      });
    });
    await waitForSubscriberCount(redis, replayChannel, 1);
    publisher.publish('test:redis:replay', id, { value: 'before-subscribe' });
    await waitForObservedDetail(observedMessages, replayChannel, 'before-subscribe');
    const replayLocalEvent = secondConsumer.subscribe('test:redis:replay', id);
    iterators.push(replayLocalEvent);
    const replayPending = replayLocalEvent.next();
    await waitForSubscriberCount(redis, replayChannel, 2);
    await assertPending(replayPending);

    const peerFirst = peer.waitForMessage(
      (message) => message.type === 'event' && message.name === 'event',
      'Redis peer did not receive the event',
    );
    publisher.publish('test:redis:event', id, { value: 'from-parent' });
    const parentEvent = { value: { value: 'from-parent' }, done: false };
    assert.deepEqual(await firstLocalNext, parentEvent);
    assert.deepEqual(await secondLocalNext, parentEvent);
    assert.deepEqual((await peerFirst).value, { value: 'from-parent' });
    await assertPending(otherPending);

    const parentOtherNext = otherPending;
    peer.send({ type: 'publish-other', requestId: 'other-1', value: 'from-peer' });
    await peer.waitForMessage(
      (message) => message.type === 'published' && message.requestId === 'other-1',
      'Redis peer did not publish its event',
    );
    assert.deepEqual(await withTimeout(parentOtherNext, 'Parent did not receive the peer event'), {
      value: { value: 'from-peer' },
      done: false,
    });
    publisher.publish(emptyTopic);
    assert.deepEqual(await withTimeout(emptyLocalNext, 'No-payload event was not delivered'), {
      value: null,
      done: false,
    });
    publisher.publish('test:redis:replay', id, { value: 'after-subscribe' });
    assert.deepEqual(await withTimeout(replayPending, 'Replay topic emitted an old event'), {
      value: { value: 'after-subscribe' },
      done: false,
    });

    await firstLocalEvent.return?.();
    await waitForSubscriberCount(redis, eventChannel, 2);
    await waitForProxyConnectionCount(proxy, 4);
    assert.deepEqual(await firstLocalEvent.next(), { value: undefined, done: true });
    const afterOneUnsubscribe = secondLocalEvent.next();
    publisher.publish('test:redis:event', id, { value: 'after-one-unsubscribe' });
    assert.deepEqual(await afterOneUnsubscribe, {
      value: { value: 'after-one-unsubscribe' },
      done: false,
    });

    await secondLocalEvent.return?.();
    await waitForSubscriberCount(redis, eventChannel, 1);
    await waitForProxyConnectionCount(proxy, 4);

    const reconnectParentNext = otherLocalEvent.next();
    proxy.setBlocked(true);
    proxy.disconnectAll();
    await waitForProxyConnectionCount(proxy, 0);
    await waitForSubscriberCount(redis, otherChannel, 0);
    assert.equal(
      await redis.publish(otherChannel, JSON.stringify({ detail: { value: 'during-disconnect' } })),
      0,
    );
    publisher.publish('test:redis:control', id, { value: 'during-disconnect' });
    await assertPending(reconnectParentNext);
    await delay(75);
    assert.equal(
      observedMessages.some(
        (message) => (message.detail as { value?: string } | null)?.value === 'during-disconnect',
      ),
      false,
    );

    proxy.setBlocked(false);
    await Promise.all([
      waitForProxyConnectionCount(proxy, 4),
      waitForSubscriberCount(redis, otherChannel, 1),
      waitForSubscriberCount(redis, eventChannel, 1),
      waitForSubscriberCount(redis, controlChannel, 2),
    ]);
    await assertPending(reconnectParentNext);
    assert.equal(
      observedMessages.some(
        (message) => (message.detail as { value?: string } | null)?.value === 'during-disconnect',
      ),
      false,
    );
    assert.equal(
      await redis.publish(otherChannel, JSON.stringify({ detail: { value: 'after-reconnect' } })),
      1,
    );
    assert.deepEqual(await withTimeout(reconnectParentNext, 'Redis subscriber did not resume'), {
      value: { value: 'after-reconnect' },
      done: false,
    });

    await Promise.all(iterators.map((iterator) => iterator.return?.()));
    await peer.close();
    disposeRedisPubSub();
    disposeRedisPubSub();
    await waitForProxyConnectionCount(proxy, 0);
  },
);
