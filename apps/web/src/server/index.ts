import { configureFedifyInboxLogging } from '@kosmo/fedify';
import { serve } from '@hono/node-server';
import app from './app';

configureFedifyInboxLogging();

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 5174),
});

export default app;
