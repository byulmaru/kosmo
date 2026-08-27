import { serve } from '@hono/node-server';
import app from './app';

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 8080),
});

export default app;
