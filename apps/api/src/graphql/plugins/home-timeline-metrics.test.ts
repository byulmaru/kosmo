import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { PothosValidationError } from '@pothos/core';
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';
import { createYoga } from 'graphql-yoga';
import type { UserContext } from '@/context';

const findAvailablePort = async (): Promise<number> => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Unable to determine a free metrics port.');
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  return address.port;
};

test('exports one home timeline outcome per GraphQL request', async (t) => {
  const previousPort = process.env.API_METRICS_PORT;
  process.env.API_METRICS_PORT = String(await findAvailablePort());

  const [
    { closeApiMetrics, startApiMetrics },
    { trackHomeTimelineRequest, useHomeTimelineMetrics },
    { useError },
  ] = await Promise.all([
    import('@/metrics'),
    import('./home-timeline-metrics'),
    import('./error'),
  ]);

  t.after(async () => {
    await closeApiMetrics();
    if (previousPort === undefined) {
      delete process.env.API_METRICS_PORT;
    } else {
      process.env.API_METRICS_PORT = previousPort;
    }
  });

  await startApiMetrics();

  const timeline = new GraphQLObjectType({
    name: 'HomeTimeline',
    fields: {
      status: { type: GraphQLString },
      partialFailure: {
        type: GraphQLString,
        resolve: (source) => {
          if (source.expectedFailure) {
            throw new PothosValidationError('Invalid nested cursor.');
          }
          throw new Error('Nested server failure');
        },
      },
    },
  });
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        homeTimeline: {
          type: timeline,
          args: { mode: { type: GraphQLString } },
          resolve: (_, args, context, info) => {
            if (args.mode === 'unauthorized') {
              return null;
            }

            trackHomeTimelineRequest(context as UserContext, info.path.key);
            if (args.mode === 'expected') {
              throw new PothosValidationError('Invalid cursor.');
            }
            if (args.mode === 'server') {
              throw new Error('Timeline server failure');
            }

            return { status: 'ok', expectedFailure: args.mode === 'expectedPartial' };
          },
        },
        unrelated: {
          type: GraphQLString,
          resolve: () => {
            throw new Error('Unrelated server failure');
          },
        },
      },
    }),
  });
  const yoga = createYoga<Record<string, never>, UserContext>({
    schema,
    context: () => ({}) as UserContext,
    maskedErrors: false,
    plugins: [useError(), useHomeTimelineMetrics()],
  });

  const execute = async (query: string) => {
    const response = await yoga.fetch(
      new Request('http://localhost/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      }),
    );
    return response.json();
  };

  assert.deepEqual(await execute('{ homeTimeline(mode: "ok") { status } }'), {
    data: { homeTimeline: { status: 'ok' } },
  });
  await execute('{ homeTimeline(mode: "expected") { status } }');
  await execute('{ homeTimeline(mode: "unauthorized") { status } }');
  await execute('{ unrelated }');
  await execute('{ homeTimeline(mode: "server") { status } }');
  await execute('{ homeTimeline(mode: "ok") { status partialFailure } }');
  await execute('{ homeTimeline(mode: "expectedPartial") { status partialFailure } }');
  await execute(`{
    successful: homeTimeline(mode: "ok") { status }
    expected: homeTimeline(mode: "expected") { status }
  }`);
  await execute(`{
    successful: homeTimeline(mode: "ok") { status }
    failed: homeTimeline(mode: "server") { status }
  }`);

  const metrics = await fetch(`http://127.0.0.1:${process.env.API_METRICS_PORT}/metrics`).then(
    (response) => response.text(),
  );
  assert.match(metrics, /^kosmo_home_timeline_requests_total\{outcome="success"\} 2$/m);
  assert.match(metrics, /^kosmo_home_timeline_requests_total\{outcome="server_error"\} 3$/m);
});
