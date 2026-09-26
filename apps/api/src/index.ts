import { serve } from '@hono/node-server';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { deriveContext } from './context';
import { yoga } from './graphql';
import { reportError } from './sentry';
import type { Env } from './context';

await resolveConfiguredLocalInstance();

const app = new Hono<Env>();

app.onError((cause, c) => {
  reportError(cause);
  console.error('Unhandled API error');
  return c.text('Internal Server Error', 500);
});

app.use(
  '/graphql',
  logger((message) => {
    const [prefix, method, requestTarget, ...details] = message.split(' ');
    const path = requestTarget?.split('?')[0];

    console.log([prefix, method, path, ...details].join(' '));
  }),
);

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.use('*', async (c, next) => {
  const context = await deriveContext(c);
  c.set('context', context);

  return next();
});

app.route('/graphql', yoga);

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
});

export default app;
