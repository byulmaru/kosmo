import { dev } from '@kosmo/core';
import { initContextCache } from '@pothos/core';
import { createYoga, useExecutionCancellation } from 'graphql-yoga';
import { Hono } from 'hono';
import { schema } from './schema';
import type { Env, ServerContext, UserContext } from '../context';

export const yoga = new Hono<Env>();

const app = createYoga<{ c: ServerContext }, UserContext>({
  schema,
  context: ({ c }) => ({ ...initContextCache(), c, ...c.get('context') }),
  graphqlEndpoint: '/graphql',
  batching: true,
  cors: {
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST'],
  },
  maskedErrors: !dev,
  landingPage: false,
  plugins: [useExecutionCancellation()],
});

yoga.on(['GET', 'POST', 'OPTIONS'], '/', async (c) => {
  const response = await app.handle(c.req.raw, { c });
  return c.newResponse(response.body, response);
});
