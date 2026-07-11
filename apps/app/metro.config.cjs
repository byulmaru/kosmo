// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro loads its config through CommonJS.
const http = require('node:http');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro loads its config through CommonJS.
const { getDefaultConfig } = require('expo/metro-config');

const WEB_BFF_PORT = 5174;
const config = getDefaultConfig(__dirname);
const defaultEnhanceMiddleware = config.server.enhanceMiddleware;

const shouldProxyToWebBff = (requestUrl = '/') => {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;

  return (
    pathname === '/graphql' ||
    pathname === '/health' ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/ap' ||
    pathname.startsWith('/ap/') ||
    pathname === '/.well-known' ||
    pathname.startsWith('/.well-known/')
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
    if (shouldProxyToWebBff(request.url)) {
      proxyToWebBff(request, response);
      return;
    }

    return fallbackMiddleware(request, response, next);
  };
};

module.exports = config;
