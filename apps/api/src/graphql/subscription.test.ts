import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createRedisPubSub } from '@kosmo/core/redis/pubsub';
import { createClient } from '@redis/client';
import { GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';
import { createYoga, useExecutionCancellation } from 'graphql-yoga';

type Events = {
  'test:api:sse': [id: string, payload: { value: string }];
};

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;

async function waitForSubscriberCount(
  readCount: () => Promise<number>,
  count: number,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    if ((await readCount()) === count) {
      return;
    }
    await delay(25);
  }
  assert.equal(await readCount(), count);
}

function createSseEventReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = '';

  return async function readEvent(): Promise<string | null> {
    while (true) {
      const separator = buffer.indexOf('\n\n');
      if (separator >= 0) {
        const event = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        if (event.trim() !== '' && !event.startsWith(':')) {
          return event;
        }
        continue;
      }

      const result = await reader.read();
      if (result.done) {
        return null;
      }
      buffer += decoder.decode(result.value, { stream: true }).replaceAll('\r\n', '\n');
    }
  };
}

function getSseData(event: string): unknown {
  const data = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n');
  return JSON.parse(data);
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

test(
  'streams Redis Pub/Sub events over Yoga SSE and unsubscribes when the response body is cancelled',
  { skip: !testRedisUrl },
  async (t) => {
    const publisher = createRedisPubSub<Events>(testRedisUrl!);
    const subscription = createRedisPubSub<Events>(testRedisUrl!);
    const redis = createClient({ url: testRedisUrl! });
    const resources: { reader?: ReadableStreamDefaultReader<Uint8Array> } = {};
    t.after(async () => {
      await resources.reader?.cancel().catch(() => undefined);
      publisher.dispose();
      subscription.dispose();
      await redis.close();
    });
    redis.on('error', () => undefined);
    await redis.connect();
    const id = randomUUID();
    const channel = `test:api:sse:${id}`;
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: { health: { type: GraphQLString, resolve: () => 'ok' } },
      }),
      subscription: new GraphQLObjectType({
        name: 'Subscription',
        fields: {
          message: {
            type: GraphQLString,
            args: { id: { type: new GraphQLNonNull(GraphQLString) } },
            subscribe: (_source, args: { id: string }) =>
              subscription.pubSub.subscribe('test:api:sse', args.id),
            resolve: (payload: { value: string }) => payload.value,
          },
        },
      }),
    });
    const yoga = createYoga({
      schema,
      graphiql: false,
      landingPage: false,
      plugins: [useExecutionCancellation()],
    });
    const query = 'subscription ($id: String!) { message(id: $id) }';
    const response = await yoga.fetch(
      new Request('http://localhost/graphql', {
        method: 'POST',
        headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables: { id } }),
      }),
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.ok(response.body);
    const reader = response.body.getReader();
    resources.reader = reader;
    const readEvent = createSseEventReader(reader);
    const expectedMessage = { value: randomUUID() };
    const pendingEvent = withTimeout(readEvent(), 'Yoga SSE did not receive a Pub/Sub event');
    const readSubscriberCount = async () => (await redis.pubSubNumSub(channel))[channel] ?? 0;
    await waitForSubscriberCount(readSubscriberCount, 1);
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      publisher.pubSub.publish('test:api:sse', id, expectedMessage);
      const event = await Promise.race([pendingEvent, delay(25).then(() => null)]);
      if (event !== null) {
        assert.match(event, /event: next/);
        assert.deepEqual(getSseData(event), { data: { message: expectedMessage.value } });
        break;
      }
    }
    assert.ok(performance.now() < deadline, 'Yoga SSE did not receive a Pub/Sub event');

    await reader.cancel();
    assert.deepEqual(
      await withTimeout(reader.read(), 'Yoga SSE did not close after body cancellation'),
      { done: true, value: undefined },
    );
    await waitForSubscriberCount(readSubscriberCount, 0);
  },
);
