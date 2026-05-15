import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { deriveContext } from './context';
import { yoga } from './graphql';
import type { Env } from './context';

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

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
});

export default app;
