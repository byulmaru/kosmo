import { initContextCache } from '@pothos/core';
import { createYoga, useExecutionCancellation } from 'graphql-yoga';
import { Hono } from 'hono';
import { profileEditCorrelationId, traceProfileEditBoundary } from '@/profile-edit-diagnostics';
import { useError } from './plugins/error';
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
  maskedErrors: false,
  landingPage: false,
  plugins: [useExecutionCancellation(), useError()],
});

yoga.on(['GET', 'POST', 'OPTIONS'], '/', async (c) => {
  const correlationId = profileEditCorrelationId({ c } as UserContext);
  traceProfileEditBoundary(correlationId, 'api-request-enter');
  const response = await app.handle(c.req.raw, { c });
  traceProfileEditBoundary(correlationId, 'api-response-start', { status: response.status });
  if (!correlationId || !response.body) {
    traceProfileEditBoundary(correlationId, 'api-response-body-end');
    return c.newResponse(response.body, response);
  }

  const body = response.body.pipeThrough(
    new TransformStream({
      flush() {
        traceProfileEditBoundary(correlationId, 'api-response-body-end');
      },
    }),
  );
  return c.newResponse(body, response);
});
