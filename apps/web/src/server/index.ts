import { serve } from '@hono/node-server';
import { configureFedifyInboxLogging } from '@kosmo/fedify';
import app from './app';

configureFedifyInboxLogging();

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 5174),
});

export default app;
