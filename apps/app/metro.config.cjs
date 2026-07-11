// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro loads its config through CommonJS.
const http = require('node:http');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro loads its config through CommonJS.
const { getDefaultConfig } = require('expo/metro-config');

const WEB_BFF_PORT = 5174;
// Generic application/json belongs to Metro manifests and symbolication too, so only
// unambiguous federation representations can safely bypass Metro on the dev origin.
const FEDERATION_MEDIA_TYPES = new Set([
  'application/activity+json',
  'application/jrd+json',
  'application/ld+json',
  'application/xrd+xml',
]);
const config = getDefaultConfig(__dirname);
const defaultEnhanceMiddleware = config.server.enhanceMiddleware;

const preferredMediaTypes = (value) => {
  const header = (Array.isArray(value) ? value : [value]).filter(Boolean).join(',');

  return header
    .split(',')
    .map((part, index) => {
      const [mediaType = '', ...parameters] = part.trim().toLowerCase().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = qualityParameter ? Number.parseFloat(qualityParameter.trim().slice(2)) : 1;

      return { index, mediaType, quality };
    })
    .filter(({ mediaType, quality }) => mediaType && quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map(({ mediaType }) => mediaType);
};

const acceptsFederation = (value) => {
  const mediaTypes = preferredMediaTypes(value);

  if (mediaTypes[0] === 'text/html' || mediaTypes[0] === 'application/xhtml+xml') {
    return false;
  }

  return mediaTypes.some((mediaType) => FEDERATION_MEDIA_TYPES.has(mediaType));
};

const hasFederationContentType = (value) => {
  const values = Array.isArray(value) ? value : [value];

  return values.some((header) =>
    FEDERATION_MEDIA_TYPES.has((header ?? '').trim().split(';', 1)[0].toLowerCase()),
  );
};

const shouldProxyToWebBff = (requestUrl = '/', headers = {}) => {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;

  return (
    pathname === '/graphql' ||
    pathname === '/health' ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/.well-known' ||
    pathname.startsWith('/.well-known/') ||
    acceptsFederation(headers.accept) ||
    hasFederationContentType(headers['content-type'])
  );
};

const proxyToWebBff = (request, response) => {
  const upstream = http.request(
    {
      headers: request.headers,
      hostname: '127.0.0.1',
      method: request.method,
      path: request.url,
      port: WEB_BFF_PORT,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on('error', () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }

    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Web BFF is unavailable');
  });
  request.pipe(upstream);
};

config.server.enhanceMiddleware = (metroMiddleware, metroServer) => {
  const fallbackMiddleware = defaultEnhanceMiddleware(metroMiddleware, metroServer);

  return (request, response, next) => {
    if (shouldProxyToWebBff(request.url, request.headers)) {
      proxyToWebBff(request, response);
      return;
    }

    return fallbackMiddleware(request, response, next);
  };
};

module.exports = config;
