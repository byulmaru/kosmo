import { serve } from '@hono/node-server';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { Hono } from 'hono';
import { deriveContext } from './context';
import { yoga } from './graphql';
import { captureUnexpectedError } from './sentry';
import type { Env } from './context';

await resolveConfiguredLocalInstance();

const app = new Hono<Env>();

app.onError((cause, c) => {
  captureUnexpectedError(cause);
  console.error('Unhandled API error');
  return c.text('Internal Server Error', 500);
});

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
