import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

const STATIC_ROOT = process.env.EXPO_WEB_ROOT ?? '../app/dist';

const staticRoutes = new Hono();
const serveSpaFallback = serveStatic({ path: 'index.html', root: STATIC_ROOT });

staticRoutes.on(['GET', 'HEAD'], '*', serveStatic({ root: STATIC_ROOT }));
staticRoutes.on(['GET', 'HEAD'], '*', (c, next) =>
  c.req.path === '/' || c.req.header('sec-fetch-mode') === 'navigate'
    ? serveSpaFallback(c, next)
    : next(),
);

export default staticRoutes;
