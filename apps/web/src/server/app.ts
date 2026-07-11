import { serveStatic } from '@hono/node-server/serve-static';
import { sessionName } from '@kosmo/core';
import { federation } from '@kosmo/fedify';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import {
  createOidcSession,
  exchangeOidcCode,
  getOidcConfiguration,
  LOGIN_CODE_VERIFIER_COOKIE,
  LOGIN_STATE_COOKIE,
  NATIVE_REDIRECT_URI,
  OidcAuthError,
} from './auth';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const LOGIN_COOKIE_MAX_AGE = 60 * 10;
const PKCE_CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const STATIC_ROOT = process.env.EXPO_WEB_ROOT ?? '../app/dist';
const FEDERATION_MEDIA_TYPES = new Set([
  'application/activity+json',
  'application/jrd+json',
  'application/json',
  'application/ld+json',
  'application/xrd+xml',
]);

type StreamingRequestInit = RequestInit & { duplex: 'half' };

const app = new Hono();
const serveSpaFallback = serveStatic({ path: 'index.html', root: STATIC_ROOT });

app.use('*', async (c, next) => {
  const fallThrough = async () => {
    await next();
    return new Response(c.res.body, c.res);
  };
  const fallThroughNotAcceptable = async () => {
    const response = await fallThrough();
    if (response.status !== 404) {
      return response;
    }

    return new Response('Not acceptable', {
      headers: { 'Content-Type': 'text/plain', Vary: 'Accept' },
      status: 406,
    });
  };

  const response = await federation.fetch(c.req.raw, {
    contextData: undefined,
    onNotAcceptable: fallThroughNotAcceptable,
    onNotFound: fallThrough,
  });

  c.res = response;
  return response;
});

app.onError((cause, c) => {
  if (cause instanceof OidcAuthError) {
    return c.text(cause.message, cause.status as ContentfulStatusCode);
  }

  console.error(cause);
  return c.text('Internal Server Error', 500);
});

app.get('/health', (c) => c.text('ok'));
app.all('/health', (c) => c.text('Method Not Allowed', 405, { Allow: 'GET' }));

app.get('/login', async (c) => {
  const state = randomState();
  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const requestUrl = new URL(c.req.url);
  const publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? requestUrl.origin);
  const redirectUri = new URL('/login/callback', publicOrigin).toString();
  const cookieOptions = {
    httpOnly: true,
    maxAge: LOGIN_COOKIE_MAX_AGE,
    path: '/login/callback',
    sameSite: 'Lax' as const,
    secure: publicOrigin.protocol === 'https:',
  };

  const authorizeUrl = buildAuthorizationUrl(await getOidcConfiguration(), {
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    scope: 'openid profile',
    state,
  });

  setCookie(c, LOGIN_STATE_COOKIE, state, cookieOptions);
  setCookie(c, LOGIN_CODE_VERIFIER_COOKIE, codeVerifier, cookieOptions);

  return c.redirect(authorizeUrl.toString(), 302);
});
app.all('/login', (c) => c.text('Method Not Allowed', 405, { Allow: 'GET' }));

app.get('/login/callback', async (c) => {
  const requestUrl = new URL(c.req.url);
  const code = requestUrl.searchParams.get('code');
  const returnedState = requestUrl.searchParams.get('state');

  if (!code || !returnedState) {
    return c.text('OIDC callback is missing code or state', 400);
  }

  const state = getCookie(c, LOGIN_STATE_COOKIE);
  const codeVerifier = getCookie(c, LOGIN_CODE_VERIFIER_COOKIE);

  if (!state || !codeVerifier || returnedState !== state) {
    return c.text('OIDC callback state is invalid', 400);
  }

  const publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? requestUrl.origin);
  const redirectUri = new URL('/login/callback', publicOrigin).toString();
  const requestedRedirectUri = requestUrl.searchParams.get('redirect_uri');

  if (requestedRedirectUri && requestedRedirectUri !== redirectUri) {
    return c.text('OIDC callback redirect_uri is invalid', 400);
  }

  const callbackUrl = new URL('/login/callback', publicOrigin);
  callbackUrl.search = requestUrl.search;
  const sessionToken = await createOidcSession(
    await exchangeOidcCode({ callbackUrl, codeVerifier, expectedState: state }),
  );

  deleteCookie(c, LOGIN_STATE_COOKIE, { path: '/login/callback' });
  deleteCookie(c, LOGIN_CODE_VERIFIER_COOKIE, { path: '/login/callback' });
  setCookie(c, sessionName, sessionToken, {
    httpOnly: true,
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'Lax',
    secure: publicOrigin.protocol === 'https:',
  });

  return c.redirect('/home', 302);
});
app.all('/login/callback', (c) => c.text('Method Not Allowed', 405, { Allow: 'GET' }));

app.post('/login/native/session', async (c) => {
  const body = (await c.req.json().catch(() => undefined)) as unknown;
  const input = body && typeof body === 'object' ? body : {};
  const code = Reflect.get(input, 'code');
  const codeVerifier = Reflect.get(input, 'codeVerifier');
  const redirectUri = Reflect.get(input, 'redirectUri');

  if (
    typeof code !== 'string' ||
    code.length < 1 ||
    code.length > 2048 ||
    typeof codeVerifier !== 'string' ||
    !PKCE_CODE_VERIFIER.test(codeVerifier) ||
    typeof redirectUri !== 'string'
  ) {
    return c.text('Native session request is invalid', 400);
  }
  if (redirectUri !== NATIVE_REDIRECT_URI) {
    return c.text('Native session redirectUri is invalid', 400);
  }

  const callbackUrl = new URL(NATIVE_REDIRECT_URI);
  callbackUrl.searchParams.set('code', code);

  return c.json({
    token: await createOidcSession(await exchangeOidcCode({ callbackUrl, codeVerifier })),
  });
});
app.all('/login/native/session', (c) => c.text('Method Not Allowed', 405, { Allow: 'POST' }));

app.post('/graphql', async (c) => {
  const publicApiOrigin = process.env.PUBLIC_API_ORIGIN;
  if (!publicApiOrigin) {
    throw new OidcAuthError(500, 'PUBLIC_API_ORIGIN is required');
  }

  const headers = new Headers();
  const accept = c.req.header('accept');
  const explicitAuthorization = c.req.header('authorization');
  const sessionToken = getCookie(c, sessionName);

  headers.set('content-type', c.req.header('content-type') ?? 'application/json');
  if (accept) {
    headers.set('accept', accept);
  }
  if (explicitAuthorization) {
    if (!/^Bearer\s+\S+$/i.test(explicitAuthorization)) {
      return c.text('Authorization header must use Bearer', 400);
    }

    headers.set('authorization', explicitAuthorization);
  } else if (sessionToken) {
    headers.set('authorization', `Bearer ${sessionToken}`);
  }

  const requestInit: StreamingRequestInit = {
    body: c.req.raw.body,
    duplex: 'half',
    headers,
    method: 'POST',
    redirect: 'manual',
  };
  const response = await globalThis.fetch(new URL('/graphql', publicApiOrigin), requestInit);

  return new Response(response.body, response);
});
app.all('/graphql', (c) => c.text('Method Not Allowed', 405, { Allow: 'POST' }));

app.on(['GET', 'HEAD'], '*', serveStatic({ root: STATIC_ROOT }));
app.on(['GET', 'HEAD'], '*', (c, next) =>
  acceptsSpa(c.req.header('accept'), c.req.path) ? serveSpaFallback(c, next) : next(),
);

export default app;

const acceptsSpa = (accept: string | undefined, path: string) => {
  if (!accept) {
    return path === '/';
  }

  const mediaTypes = preferredMediaTypes(accept);
  const preferred = mediaTypes[0];
  const prefersHtml = preferred === 'text/html' || preferred === 'application/xhtml+xml';

  if (mediaTypes.some((mediaType) => FEDERATION_MEDIA_TYPES.has(mediaType)) && !prefersHtml) {
    return false;
  }

  return prefersHtml || (preferred === '*/*' && path === '/');
};

const preferredMediaTypes = (accept: string) =>
  accept
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
