import { serve } from '@hono/node-server';
import { federation } from '@kosmo/fedify';
import { createWebApp, webServerConfigFromEnv } from './app';

const app = createWebApp({
  config: webServerConfigFromEnv(),
  federationFetch: (request) => federation.fetch(request, { contextData: undefined }),
});

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 5174),
});

export default app;
