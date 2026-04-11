import { resolve } from 'node:path';
import { createRequestHandler } from 'expo-server/adapter/bun';
import { Hono } from 'hono';

const buildDirectory = resolve(process.cwd(), 'dist/server');
const expoHandler = createRequestHandler({
  build: buildDirectory,
  environment: process.env.NODE_ENV,
});

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.all('*', async (c) => {
  return expoHandler(c.req.raw);
});

export default app;
