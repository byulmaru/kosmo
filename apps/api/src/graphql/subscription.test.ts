import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { disposeRedisPubSub, redisEventTarget } from '@kosmo/core/redis/pubsub';
import { createClient } from '@redis/client';
import { GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';
import { createPubSub, createYoga, useExecutionCancellation } from 'graphql-yoga';
import {
  createSseEventReader,
  getSseData,
  waitForSubscriberCount,
  withTimeout,
} from './subscription-test-helpers';

type Events = {
  'test:api:sse': [id: string, payload: { value: string }];
};

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;

test(
  'streams Redis Pub/Sub events over Yoga SSE and unsubscribes when the response body is cancelled',
  { skip: !testRedisUrl },
  async (t) => {
    const previousRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = testRedisUrl!;
    const publisher = createPubSub<Events>({ eventTarget: redisEventTarget });
    const subscription = createPubSub<Events>({ eventTarget: redisEventTarget });
    const redis = createClient({ url: testRedisUrl! });
    const resources: { reader?: ReadableStreamDefaultReader<Uint8Array> } = {};
    t.after(async () => {
      await resources.reader?.cancel().catch(() => undefined);
      try {
        await disposeRedisPubSub();
      } finally {
        try {
          await redis.close();
        } finally {
          if (previousRedisUrl === undefined) {
            delete process.env.REDIS_URL;
          } else {
            process.env.REDIS_URL = previousRedisUrl;
          }
        }
      }
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
              subscription.subscribe('test:api:sse', args.id),
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
      publisher.publish('test:api:sse', id, expectedMessage);
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
