import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { pg } from '@kosmo/core/db';
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { Hono } from 'hono';
import { deriveContext } from '../../../src/context';
import { createGraphQLContext } from '../../../src/graphql';
import type { Context, Env, ServerContext, UserContext } from '../../../src/context';

process.env.NODE_ENV = 'production';

after(async () => {
  await pg.end();
});

const createGraphQLApp = ({
  schema,
  onContext,
}: {
  schema: GraphQLSchema;
  onContext?: (context: Context) => void;
}) => {
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
    onContext?.(context);
    c.set('context', context);
    return next();
  });
  app.all('/graphql', async (c) => {
    const response = await yoga.handle(c.req.raw, { c });
    return c.newResponse(response.body, response);
  });

  return app;
};

describe('GraphQL request context', () => {
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
    const app = createGraphQLApp({ schema });

    const response = await app.request('/graphql', {
      body: JSON.stringify([{ query: '{ value }' }, { query: '{ value }' }]),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    assert.equal(response.status, 400);
    assert.match(JSON.stringify(await response.json()), /batch/i);
    assert.equal(executed, 0);
  });

  test('uses the request context directly and observes selected Profile changes', async () => {
    let persistedProfileId = 'initial-profile';
    const requestContexts: Context[] = [];
    let executionContext: UserContext | undefined;
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'RequestContextQuery',
        fields: {
          profileId: {
            type: GraphQLString,
            resolve: (_source, _args, context: UserContext) => context.session?.profileId,
          },
        },
      }),
      mutation: new GraphQLObjectType({
        name: 'RequestContextMutation',
        fields: {
          selectProfile: {
            type: GraphQLString,
            resolve: (_source, _args, context: UserContext) => {
              executionContext = context;
              const session = context.session;
              assert.ok(session);
              session.profileId = 'selected-profile';
              persistedProfileId = session.profileId;
              return session.profileId;
            },
          },
          profileIdAfterSelect: {
            type: GraphQLString,
            resolve: (_source, _args, context: UserContext) => {
              executionContext = context;
              return context.session?.profileId;
            },
          },
        },
      }),
    });
    const app = createGraphQLApp({
      schema,
      onContext: (context) => {
        context.session!.profileId = persistedProfileId;
        requestContexts.push(context);
      },
    });

    const mutationResponse = await app.request('/graphql', {
      body: JSON.stringify({ query: 'mutation { selectProfile profileIdAfterSelect }' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    assert.equal(mutationResponse.status, 200);
    assert.deepEqual(await mutationResponse.json(), {
      data: {
        selectProfile: 'selected-profile',
        profileIdAfterSelect: 'selected-profile',
      },
    });
    assert.equal(executionContext?.session, requestContexts[0]?.session);
    assert.equal(executionContext?.$loaders, requestContexts[0]?.$loaders);
    assert.equal(executionContext?.loader, requestContexts[0]?.loader);

    const nextRequestResponse = await app.request('/graphql', {
      body: JSON.stringify({ query: '{ profileId }' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    assert.equal(nextRequestResponse.status, 200);
    assert.deepEqual(await nextRequestResponse.json(), {
      data: { profileId: 'selected-profile' },
    });
    assert.notEqual(requestContexts[0], requestContexts[1]);
  });
});
