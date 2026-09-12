import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { etag } from 'hono/etag';
import type { Context } from 'hono';

const HASHED_ASSET = /(?:^|[.-])[a-f\d]{32}(?=[.@]|$)/i;
const STATIC_ROOT = process.env.EXPO_WEB_ROOT ?? '../app/dist';
const PUBLIC_POLICY_PATHS = new Set(['/privacy', '/account-deletion', '/child-safety']);
const acceptsDocument = (c: Context) => {
  const accept = c.req.header('accept');
  return !accept || accept === '*/*' || accept.includes('text/html');
};
const isSpaRequest = (c: Context) =>
  c.req.path === '/' ||
  c.req.path === '/index.html' ||
  c.req.header('sec-fetch-mode') === 'navigate' ||
  (PUBLIC_POLICY_PATHS.has(c.req.path) && acceptsDocument(c));

const staticRoutes = new Hono();
const spaEtag = etag();
const serveSpaFallback = serveStatic({
  onFound: (_path, c) => c.res.headers.set('Cache-Control', 'no-cache'),
  path: 'index.html',
  precompressed: true,
  root: STATIC_ROOT,
});

staticRoutes.on(['GET', 'HEAD'], '*', async (c, next) => {
  if (!isSpaRequest(c)) {
    return next();
  }

  await spaEtag(c, next);
  c.res.headers.set('Cache-Control', 'no-cache');
});
staticRoutes.on(
  ['GET', 'HEAD'],
  '*',
  serveStatic({
    onFound: (_path, c) =>
      c.res.headers.set(
        'Cache-Control',
        HASHED_ASSET.test(c.req.path) ? 'public, max-age=31536000, immutable' : 'no-cache',
      ),
    precompressed: true,
    root: STATIC_ROOT,
  }),
);
staticRoutes.on(['GET', 'HEAD'], '*', (c, next) =>
  isSpaRequest(c) ? serveSpaFallback(c, next) : next(),
);

export default staticRoutes;
