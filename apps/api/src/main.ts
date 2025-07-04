import '@kosmo/commonlib/dayjs';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { deriveContext } from '@/context';
import { env } from '@/env';
import { yoga } from '@/graphql';
import type { Env } from '@/context';

const app = new Hono<Env>();

app.use('*', async (c, next) => {
  const context = await deriveContext(c);
  c.set('context', context);

  return next();
});

app.route('/graphql', yoga);

serve(
  {
    fetch: app.fetch,
    port: env.LISTEN_PORT ?? 8260,
  },
  (info) => {
    console.log(`Listening on port ${info.port}`);
  },
);
