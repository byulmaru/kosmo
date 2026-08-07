import { initContextCache } from '@pothos/core';
import { createYoga, useExecutionCancellation } from 'graphql-yoga';
import { Hono } from 'hono';
import { createOperationContext } from '../context';
import { useError } from './plugins/error';
import { useOperationContext } from './plugins/operation-context';
import { schema } from './schema';
import type { Env, ServerContext, UserContext } from '../context';

export const yoga = new Hono<Env>();

const app = createYoga<{ c: ServerContext }, UserContext>({
  schema,
  context: ({ c }) => ({
    ...initContextCache(),
    c,
    ...createOperationContext(c.get('context')),
  }),
  graphqlEndpoint: '/graphql',
  batching: true,
  cors: {
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST'],
  },
  maskedErrors: false,
  landingPage: false,
  plugins: [useExecutionCancellation(), useOperationContext(), useError()],
});

yoga.on(['GET', 'POST', 'OPTIONS'], '/', async (c) => {
  const response = await app.handle(c.req.raw, { c });
  return c.newResponse(response.body, response);
});
