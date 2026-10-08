import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { etag } from 'hono/etag';
import { parseAccept } from 'hono/utils/accept';
import type { Context } from 'hono';

const HASHED_ASSET = /(?:^|[.-])[a-f\d]{32}(?=[.@]|$)/i;
const STATIC_ROOT = process.env.EXPO_WEB_ROOT ?? '../app/dist';
const PUBLIC_POLICY_PATHS = new Set(['/privacy', '/account-deletion', '/child-safety']);
const PUBLIC_PROFILE_PATH =
  /^\/@(?:\w{3,30}|[\w.]+@[\w.-]+(?::\d+)?)(?:\/[\w-]+(?:\/reactions)?)?\/?$/;
const acceptsDocument = (c: Context) => {
  const accept = c.req.header('accept');
  if (!accept) {
    return true;
  }
  const types = parseAccept(accept);
  const document =
    types.find(({ type }) => type === 'text/html') ??
    types.find(({ type }) => type === 'text/*') ??
    types.find(({ type }) => type === '*/*');
  return (document?.q ?? 0) > 0;
};
const isSpaRequest = (c: Context) =>
  c.req.path === '/' ||
  c.req.path === '/index.html' ||
  c.req.header('sec-fetch-mode') === 'navigate' ||
  ((PUBLIC_POLICY_PATHS.has(c.req.path) || PUBLIC_PROFILE_PATH.test(c.req.path)) &&
    acceptsDocument(c));

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
