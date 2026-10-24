import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { etag } from 'hono/etag';
import Negotiator from 'negotiator';
import type { Context } from 'hono';

const HASHED_ASSET = /(?:^|[.-])[a-f\d]{32}(?=[.@]|$)/i;
const STATIC_ROOT = process.env.EXPO_WEB_ROOT ?? '../app/dist';
const PUBLIC_POLICY_PATHS = new Set([
  '/privacy',
  '/privacy/2026-09-09',
  '/privacy/changes/2026-10-13',
  '/account-deletion',
  '/child-safety',
]);
const PUBLIC_PROFILE_PATH =
  /^\/@(?:\w{3,30}|[\w.]+@(?:[\w.-]+|\[[\da-f:.]+\])(?::\d+)?)(?:\/[\w-]+(?:\/reactions)?)?\/?$/i;
const isPublicDocumentPath = (path: string) =>
  PUBLIC_POLICY_PATHS.has(path) || PUBLIC_PROFILE_PATH.test(path);
const acceptsDocument = (c: Context) => {
  const accept = c.req.header('accept');
  if (!accept) {
    return true;
  }
  return (
    new Negotiator({ headers: { accept } }).mediaType(['text/html; charset=UTF-8']) !== undefined
  );
};
const isSpaRequest = (c: Context) =>
  c.req.path === '/' ||
  c.req.path === '/index.html' ||
  c.req.header('sec-fetch-mode') === 'navigate' ||
  (isPublicDocumentPath(c.req.path) && acceptsDocument(c));

const staticRoutes = new Hono();
staticRoutes.on(['GET', 'HEAD'], '*', async (c, next) => {
  await next();
  if (isPublicDocumentPath(c.req.path)) {
    c.header('Vary', 'Accept', { append: true });
  }
});
const spaEtag = etag();
const serveHomepage = serveStatic({
  onFound: (_path, c) => c.res.headers.set('Cache-Control', 'no-cache'),
  path: 'home.html',
  precompressed: true,
  root: STATIC_ROOT,
});
const serveSpaFallback = serveStatic({
  onFound: (_path, c) => c.res.headers.set('Cache-Control', 'no-cache'),
  path: 'index.html',
  precompressed: true,
  root: STATIC_ROOT,
});
const serveStaticAsset = serveStatic({
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

  await spaEtag(c, next);
  c.res.headers.set('Cache-Control', 'no-cache');
});
staticRoutes.on(['GET', 'HEAD'], '*', (c, next) =>
  c.req.path === '/' ? serveHomepage(c, next) : serveStaticAsset(c, next),
);
staticRoutes.on(['GET', 'HEAD'], '*', (c, next) =>
  isSpaRequest(c) ? serveSpaFallback(c, next) : next(),
);

export default staticRoutes;
