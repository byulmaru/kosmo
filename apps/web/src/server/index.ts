import { serve } from '@hono/node-server';
import { configureFedifyInboxLogging } from '@kosmo/fedify';
import * as Sentry from '@sentry/node';
import app from './app';

configureFedifyInboxLogging(Sentry);

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 5174),
});

export default app;
