import { initContextCache } from '@pothos/core';
import { createYoga, useExecutionCancellation } from 'graphql-yoga';
import { Hono } from 'hono';
import { applySelectedProfileExtension } from '../context';
import { useError } from './plugins/error';
import { schema } from './schema';
import type { Env, ServerContext, UserContext } from '../context';

export const yoga = new Hono<Env>();

export const createGraphQLContext = async ({
  c,
  params,
}: {
  c: ServerContext;
  params?: { extensions?: unknown };
}): Promise<UserContext> => {
  const context = c.get('context');
  await applySelectedProfileExtension(context, params?.extensions);
  return Object.assign(context, initContextCache(), { c });
};

const app = createYoga<{ c: ServerContext }, UserContext>({
  schema,
  context: createGraphQLContext,
  graphqlEndpoint: '/graphql',
  batching: false,
  cors: {
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST'],
  },
  maskedErrors: false,
  landingPage: false,
  plugins: [useExecutionCancellation(), useError()],
});

yoga.on(['GET', 'POST', 'OPTIONS'], '/', async (c) => {
  const response = await app.handle(c.req.raw, { c });
  return c.newResponse(response.body, response);
});
