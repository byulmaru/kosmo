import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pg } from '@kosmo/core/db';
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { Hono } from 'hono';
import { deriveContext } from '../../../src/context';
import { createGraphQLContext } from '../../../src/graphql';
import type { Env, ServerContext, UserContext } from '../../../src/context';

process.env.NODE_ENV = 'production';

after(async () => {
  await pg.end();
});

const createGraphQLApp = (schema: GraphQLSchema) => {
  const yoga = createYoga<{ c: ServerContext }, UserContext>({
    schema,
    graphqlEndpoint: '/graphql',
    batching: false,
    plugins: [],
    context: createGraphQLContext,
  });
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    const context = await deriveContext(c);
    context.session = { id: 'session', accountId: 'account', profileId: 'initial-profile' };
    c.set('context', context);
    return next();
  });
  app.all('/graphql', async (c) => {
    const response = await yoga.handle(c.req.raw, { c });
    return c.newResponse(response.body, response);
  });

  return app;
};

test('does not execute a JSON array body as a batch', async () => {
  let executed = 0;
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'RequestContextBatchQuery',
      fields: {
        value: {
          type: GraphQLString,
          resolve: () => {
            executed += 1;
            return 'ok';
          },
        },
      },
    }),
  });
  const app = createGraphQLApp(schema);

  const response = await app.request('/graphql', {
    body: JSON.stringify([{ query: '{ value }' }, { query: '{ value }' }]),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /batch/i);
  assert.equal(executed, 0);
});
