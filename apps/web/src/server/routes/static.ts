import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { etag } from 'hono/etag';
import type { Context } from 'hono';

const HASHED_ASSET = /(?:^|[.-])[a-f\d]{32}(?=[.@]|$)/i;
const PUBLIC_ORIGIN_PLACEHOLDER = '__KOSMO_PUBLIC_ORIGIN__';
const STATIC_ROOT = process.env.EXPO_WEB_ROOT ?? '../app/dist';
const isSpaRequest = (c: Context) =>
  c.req.path === '/' ||
  c.req.path === '/index.html' ||
  c.req.header('sec-fetch-mode') === 'navigate';

const injectPublicOrigin = async (c: Context) => {
  if (!c.res.ok) {
    return;
  }

  const publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? c.req.url).origin;
  const response = c.res;
  response.headers.delete('Content-Encoding');
  response.headers.delete('Content-Length');

  if (c.req.method === 'HEAD') {
    return;
  }

  const html = (await response.text()).replaceAll(PUBLIC_ORIGIN_PLACEHOLDER, publicOrigin);
  const headers = new Headers(response.headers);
  c.res = new Response(html, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const staticRoutes = new Hono();
const spaEtag = etag();
const serveSpaFallback = serveStatic({
  onFound: (_path, c) => c.res.headers.set('Cache-Control', 'no-cache'),
  path: 'index.html',
  root: STATIC_ROOT,
});
const serveAsset = serveStatic({
  onFound: (_path, c) =>
    c.res.headers.set(
      'Cache-Control',
      HASHED_ASSET.test(c.req.path) ? 'public, max-age=31536000, immutable' : 'no-cache',
    ),
  precompressed: true,
  root: STATIC_ROOT,
});

staticRoutes.on(['GET', 'HEAD'], '*', async (c, next) => {
  if (!isSpaRequest(c)) {
    return next();
  }

  await spaEtag(c, async () => {
    await next();
    await injectPublicOrigin(c);
  });
  c.res.headers.set('Cache-Control', 'no-cache');
});
staticRoutes.on(['GET', 'HEAD'], '*', (c, next) =>
  isSpaRequest(c) ? next() : serveAsset(c, next),
);
staticRoutes.on(['GET', 'HEAD'], '*', (c, next) =>
  isSpaRequest(c) ? serveSpaFallback(c, next) : next(),
);

export default staticRoutes;
