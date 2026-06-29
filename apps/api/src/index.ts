import { serve } from '@hono/node-server';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { Hono } from 'hono';
import { deriveContext } from './context';
import { yoga } from './graphql';
import { rest } from './rest';
import type { Env } from './context';

await resolveConfiguredLocalInstance({ publicOrigin: process.env.PUBLIC_ORIGIN });

const app = new Hono<Env>();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.use('*', async (c, next) => {
  const context = await deriveContext(c);
  c.set('context', context);

  return next();
});

app.route('/graphql', yoga);
app.route('/', rest);

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
});

export default app;
