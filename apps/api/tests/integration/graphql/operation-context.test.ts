import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type {
  deriveContext as DeriveContext,
  Env,
  ServerContext,
  UserContext,
} from '../../../src/context';
import type { createGraphQLContext as CreateGraphQLContext } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'production';

let pg: typeof CoreDb.pg;
let deriveContext: typeof DeriveContext;
let createGraphQLContext: typeof CreateGraphQLContext;

before(async () => {
  ({ pg } = await import('@kosmo/core/db'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ createGraphQLContext } = await import('../../../src/graphql'));
});

after(async () => {
  await pg.end();
});

test('HTTP batch operations isolate session snapshots and loader registries', async () => {
  const observations: Array<{
    session: NonNullable<UserContext['session']>;
    loaders: UserContext['$loaders'];
    loader: unknown;
  }> = [];
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'OperationContextBatchQuery',
      fields: {
        operationContext: {
          type: GraphQLString,
          resolve: async (_source, _args, rawContext: unknown) => {
            const context = rawContext as UserContext;
            const loader = context.loader({
              name: 'operation-context.batch-probe',
              load: async (keys: string[]) => keys.map((key) => ({ key })),
              key: (row) => row.key,
            });
            await loader.load('same-key');
            const session = context.session;
            assert.ok(session);
            observations.push({
              session,
              loaders: context.$loaders,
              loader,
            });
            return `${session.accountId}:${session.profileId ?? 'none'}`;
          },
        },
      },
    }),
  });
  const yoga = createYoga<{ c: ServerContext }, UserContext>({
    schema,
    graphqlEndpoint: '/graphql',
    batching: true,
    plugins: [],
    context: createGraphQLContext,
  });
  const app = new Hono<Env>();
  let requestSession: NonNullable<UserContext['session']> | undefined;
  app.use('*', async (c, next) => {
    const context = await deriveContext(c);
    context.session = { id: 'session', accountId: 'account', profileId: 'profile' };
    requestSession = context.session;
    c.set('context', context);
    return next();
  });
  app.all('/graphql', async (c) => {
    const response = await yoga.handle(c.req.raw, { c });
    return c.newResponse(response.body, response);
  });

  const response = await app.request('/graphql', {
    body: JSON.stringify([{ query: '{ operationContext }' }, { query: '{ operationContext }' }]),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [
    { data: { operationContext: 'account:profile' } },
    { data: { operationContext: 'account:profile' } },
  ]);
  assert.equal(observations.length, 2);
  assert.notEqual(observations[0]?.session, observations[1]?.session);
  assert.notEqual(observations[0]?.session, requestSession);
  assert.notEqual(observations[1]?.session, requestSession);
  assert.notEqual(observations[0]?.loaders, observations[1]?.loaders);
  assert.notEqual(observations[0]?.loader, observations[1]?.loader);
  assert.equal(observations[0]?.loaders.size, 1);
  assert.equal(observations[1]?.loaders.size, 1);
});
