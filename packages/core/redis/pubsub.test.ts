import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@redis/client';
import { createRedisPubSub } from './pubsub.ts';
import type { Socket } from 'node:net';

type Events = {
  [topic: `test:redis:empty:${string}`]: [];
  'test:redis:control': [id: string, payload: { value: string }];
  'test:redis:event': [id: string, payload: { value: string }];
  'test:redis:other': [id: string, payload: { value: string }];
};

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;

async function waitForSubscriberCount(
  redis: ReturnType<typeof createClient>,
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

async function publishUntilReceived(
  pubSub: ReturnType<typeof createRedisPubSub<Events>>['pubSub'],
  pendingValue: Promise<{ value: string }>,
  id: string,
  expectedValue: string,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    pubSub.publish('test:redis:control', id, { value: expectedValue });
    const result = await Promise.race([
      pendingValue.then((value) => ({ value })),
      delay(25).then(() => undefined),
    ]);
    if (result !== undefined) {
      assert.deepEqual(result.value, { value: expectedValue });
      return;
    }
  }
  assert.fail('Redis Pub/Sub did not deliver a control event');
}

async function assertPending<T>(promise: Promise<T>): Promise<void> {
  const pending = Symbol('pending');
  assert.equal(await Promise.race([promise, delay(75).then(() => pending)]), pending);
}

type RedisProxyConnection = {
  client: Socket;
  upstream: Socket;
  closed: boolean;
  close: () => void;
};

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

test(
  'delivers typed events across factories, isolates topics, unsubscribes listeners, and does not replay',
  { skip: !testRedisUrl },
  async (t) => {
    const publisher = createRedisPubSub<Events>(testRedisUrl!);
    const subscriber = createRedisPubSub<Events>(testRedisUrl!);
    const redis = createClient({ url: testRedisUrl! });
    redis.on('error', () => undefined);
    await redis.connect();

    const iterators: AsyncIterator<unknown>[] = [];
    t.after(async () => {
      await Promise.all(iterators.map((iterator) => iterator.return?.()));
      publisher.dispose();
      subscriber.dispose();
      await redis.close();
    });

    const id = randomUUID();
    const controlChannel = `test:redis:control:${id}`;
    const eventChannel = `test:redis:event:${id}`;
    const otherChannel = `test:redis:other:${id}`;
    const emptyTopic = `test:redis:empty:${id}`;
    const control = subscriber.pubSub.subscribe('test:redis:control', id);
    iterators.push(control);
    const publisherReady = nextValue(control);
    await waitForSubscriberCount(redis, controlChannel, 1);
    await publishUntilReceived(publisher.pubSub, publisherReady, id, 'publisher-ready');

    publisher.pubSub.publish('test:redis:event', id, { value: 'before-subscribe' });
    publisher.pubSub.publish('test:redis:control', id, { value: 'publish-barrier' });
    let controlValue = await nextValue(control);
    while (controlValue.value !== 'publish-barrier') {
      controlValue = await nextValue(control);
    }

    const first = subscriber.pubSub.subscribe('test:redis:event', id);
    iterators.push(first);
    const firstNext = first.next();
    await waitForSubscriberCount(redis, eventChannel, 1);
    await assertPending(firstNext);

    const second = subscriber.pubSub.subscribe('test:redis:event', id);
    iterators.push(second);
    const secondNext = second.next();
    const other = subscriber.pubSub.subscribe('test:redis:other', id);
    iterators.push(other);
    const otherNext = other.next();
    await Promise.all([
      waitForSubscriberCount(redis, eventChannel, 1),
      waitForSubscriberCount(redis, otherChannel, 1),
    ]);

    publisher.pubSub.publish('test:redis:event', id, { value: 'first-event' });
    assert.deepEqual(await Promise.all([firstNext, secondNext]), [
      { value: { value: 'first-event' }, done: false },
      { value: { value: 'first-event' }, done: false },
    ]);
    await assertPending(otherNext);

    publisher.pubSub.publish('test:redis:other', id, { value: 'other-topic' });
    assert.deepEqual(await otherNext, { value: { value: 'other-topic' }, done: false });

    await first.return?.();
    await waitForSubscriberCount(redis, eventChannel, 1);
    publisher.pubSub.publish('test:redis:event', id, { value: 'after-one-unsubscribed' });
    assert.deepEqual(await nextValue(second), { value: 'after-one-unsubscribed' });
    assert.deepEqual(await first.next(), { value: undefined, done: true });

    await second.return?.();
    await waitForSubscriberCount(redis, eventChannel, 0);

    const empty = subscriber.pubSub.subscribe(emptyTopic);
    iterators.push(empty);
    const emptyNext = empty.next();
    await waitForSubscriberCount(redis, emptyTopic, 1);
    publisher.pubSub.publish(emptyTopic);
    assert.deepEqual(await emptyNext, { value: null, done: false });
    await empty.return?.();
    await waitForSubscriberCount(redis, emptyTopic, 0);

    await control.return?.();
    await other.return?.();
    publisher.dispose();
    publisher.dispose();
    subscriber.dispose();
    subscriber.dispose();
  },
);

test(
  'drops publishes before initial Redis readiness and resumes after a subscriber reconnects',
  { skip: !testRedisUrl },
  async (t) => {
    const id = randomUUID();
    const channel = `test:redis:event:${id}`;
    const proxy = await createRedisProxy(testRedisUrl!);
    proxy.setBlocked(true);
    const pubSub = createRedisPubSub<Events>(proxy.url);
    const redis = createClient({ url: testRedisUrl! });
    const observer = createClient({ url: testRedisUrl! });
    redis.on('error', () => undefined);
    observer.on('error', () => undefined);

    const observedMessages: { value: string }[] = [];
    const iterators: AsyncIterator<unknown>[] = [];
    t.after(async () => {
      await Promise.all(iterators.map((iterator) => iterator.return?.()));
      pubSub.dispose();
      pubSub.dispose();
      await observer.unsubscribe(channel).catch(() => undefined);
      await Promise.all([redis.close(), observer.close()]);
      await proxy.close();
    });

    await Promise.all([redis.connect(), observer.connect()]);
    await observer.subscribe(channel, (message) => {
      observedMessages.push((JSON.parse(message) as { detail: { value: string } }).detail);
    });
    await waitForSubscriberCount(redis, channel, 1);

    pubSub.pubSub.publish('test:redis:event', id, { value: 'before-initial-readiness' });
    proxy.setBlocked(false);
    const publisherReadyDeadline = performance.now() + 5_000;
    while (
      performance.now() < publisherReadyDeadline &&
      !observedMessages.some((message) => message.value === 'publisher-ready')
    ) {
      pubSub.pubSub.publish('test:redis:event', id, { value: 'publisher-ready' });
      await delay(25);
    }
    assert.ok(observedMessages.some((message) => message.value === 'publisher-ready'));
    assert.ok(!observedMessages.some((message) => message.value === 'before-initial-readiness'));

    const iterator = pubSub.pubSub.subscribe('test:redis:event', id);
    iterators.push(iterator);
    const pendingEvent = iterator.next();
    await Promise.all([
      waitForSubscriberCount(redis, channel, 2),
      waitForProxyConnectionCount(proxy, 2),
    ]);

    proxy.setBlocked(true);
    proxy.disconnectAll();
    await waitForProxyConnectionCount(proxy, 0);
    await waitForSubscriberCount(redis, channel, 1);
    assert.equal(
      await redis.publish(channel, JSON.stringify({ detail: { value: 'during-disconnect' } })),
      1,
    );
    await assertPending(pendingEvent);

    proxy.setBlocked(false);
    await Promise.all([
      waitForSubscriberCount(redis, channel, 2),
      waitForProxyConnectionCount(proxy, 2),
    ]);
    await assertPending(pendingEvent);
    assert.equal(
      await redis.publish(channel, JSON.stringify({ detail: { value: 'after-reconnect' } })),
      2,
    );
    assert.deepEqual(await withTimeout(pendingEvent, 'Redis subscriber did not resume'), {
      value: { value: 'after-reconnect' },
      done: false,
    });

    await iterator.return?.();
    await waitForSubscriberCount(redis, channel, 1);
    await observer.unsubscribe(channel);
    await waitForSubscriberCount(redis, channel, 0);
    pubSub.dispose();
    pubSub.dispose();
    await waitForProxyConnectionCount(proxy, 0);
  },
);
