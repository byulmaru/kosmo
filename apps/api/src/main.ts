import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { deriveContext } from '@/context';
import { yoga } from '@/graphql';
import { rest } from './rest';
import type { Env } from '@/context';

const app = new Hono<Env>();

app.get('/health', (c) => c.json({ status: 'ok' }));

app.use(
  cors({
    allowHeaders: ['Authorization', 'Content-Type'],
    origin: '*',
  }),
);

app.use('*', async (c, next) => {
  const context = await deriveContext(c);
  c.set('context', context);

  return next();
});

app.route('/graphql', yoga);
app.route('/', rest);

serve(
  {
    fetch: app.fetch,
    port: 8260,
  },
  (info) => {
    console.log(`Listening on port ${info.port}`);
  },
);
