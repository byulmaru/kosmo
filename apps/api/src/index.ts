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

export default app;
