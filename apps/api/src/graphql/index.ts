import { feedbackMultipartMaxBytes, readRequestBodyWithinLimit } from '@kosmo/core/validation';
import { initContextCache } from '@pothos/core';
import { createYoga, useExecutionCancellation } from 'graphql-yoga';
import { Hono } from 'hono';
import { useError } from './plugins/error';
import { schema } from './schema';
import type { Env, ServerContext, UserContext } from '../context';

export const yoga = new Hono<Env>();

export const createGraphQLContext = ({ c }: { c: ServerContext }): UserContext =>
  Object.assign(c.get('context'), initContextCache(), { c });

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
  const isMultipart = c.req.header('content-type')?.toLowerCase().startsWith('multipart/form-data');
  let request = c.req.raw;
  if (isMultipart) {
    const body = await readRequestBodyWithinLimit(c.req.raw, feedbackMultipartMaxBytes);
    if (body === null) {
      return c.text('Request body too large', 413);
    }
    request = new Request(c.req.raw, {
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  }

  const response = await app.handle(request, { c });
  return c.newResponse(response.body, response);
});
