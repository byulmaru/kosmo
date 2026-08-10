import { initContextCache } from '@pothos/core';
import { createYoga, useExecutionCancellation } from 'graphql-yoga';
import { Hono } from 'hono';
import { createOperationContext } from '../context';
import { useError } from './plugins/error';
import { useOperationDatabaseSession } from './plugins/operation-db-session';
import { schema } from './schema';
import type { Env, ServerContext, UserContext } from '../context';

export const yoga = new Hono<Env>();

export const createGraphQLContext = ({ c }: { c: ServerContext }) => ({
  ...initContextCache(),
  c,
  ...createOperationContext(c.get('context')),
});

const app = createYoga<{ c: ServerContext }, UserContext>({
  schema,
  context: createGraphQLContext,
  graphqlEndpoint: '/graphql',
  batching: true,
  cors: {
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST'],
  },
  maskedErrors: false,
  landingPage: false,
  plugins: [useExecutionCancellation(), useOperationDatabaseSession(), useError()],
});

yoga.on(['GET', 'POST', 'OPTIONS'], '/', async (c) => {
  const response = await app.handle(c.req.raw, { c });
  return c.newResponse(response.body, response);
});
