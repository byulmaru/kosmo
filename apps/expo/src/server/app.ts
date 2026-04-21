import { resolve } from 'node:path';
import { createRequestHandler } from 'expo-server/adapter/bun';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';

const expoHandler = createRequestHandler({
  build: resolve(process.cwd(), 'dist/server'),
  environment: process.env.NODE_ENV,
});

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.use('*', serveStatic({ root: resolve(process.cwd(), 'dist/client') }));

app.all('*', (c) => {
  return expoHandler(c.req.raw);
});

export default app;
