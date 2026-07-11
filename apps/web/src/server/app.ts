import { serveStatic } from '@hono/node-server/serve-static';
import { sessionName } from '@kosmo/core';
import { federation } from '@kosmo/fedify';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  createOidcSession,
  DEFAULT_OIDC_AUTHORIZE_URL,
  DEFAULT_OIDC_TOKEN_URL,
  exchangeOidcCode,
  LOGIN_CODE_VERIFIER_COOKIE,
  LOGIN_STATE_COOKIE,
  NATIVE_REDIRECT_URI,
  OidcAuthError,
} from './auth';
import type { Context } from 'hono';
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
app.all('/health', methodNotAllowed);

app.get('/login', async (c) => {
  const clientId = requireOidcClientId();
  const state = createCodeVerifier();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const requestUrl = new URL(c.req.url);
  const publicOrigin = getPublicOrigin(requestUrl);
  const redirectUri = new URL('/login/callback', publicOrigin).toString();
  const cookieOptions = {
    httpOnly: true,
    maxAge: LOGIN_COOKIE_MAX_AGE,
    path: '/login/callback',
    sameSite: 'Lax' as const,
    secure: publicOrigin.protocol === 'https:',
  };

  setCookie(c, LOGIN_STATE_COOKIE, state, cookieOptions);
  setCookie(c, LOGIN_CODE_VERIFIER_COOKIE, codeVerifier, cookieOptions);

  const authorizeUrl = new URL(process.env.OIDC_AUTHORIZE_URL ?? DEFAULT_OIDC_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', 'openid profile');
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', state);

  return c.redirect(authorizeUrl.toString(), 302);
});
app.all('/login', methodNotAllowed);

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

  const publicOrigin = getPublicOrigin(requestUrl);
  const redirectUri = new URL('/login/callback', publicOrigin).toString();
  const requestedRedirectUri = requestUrl.searchParams.get('redirect_uri');

  if (requestedRedirectUri && requestedRedirectUri !== redirectUri) {
    return c.text('OIDC callback redirect_uri is invalid', 400);
  }

  const { clientId, clientSecret } = requireOidcConfig();
  const tokens = await exchangeOidcCode(
    {
      clientId,
      clientSecret,
      code,
      codeVerifier,
      redirectUri,
      tokenUrl: process.env.OIDC_TOKEN_URL ?? DEFAULT_OIDC_TOKEN_URL,
    },
    globalThis.fetch,
  );
  const sessionToken = await createOidcSession(tokens);

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
app.all('/login/callback', methodNotAllowed);

app.post('/login/native/session', async (c) => {
  const body = (await c.req.json().catch(() => undefined)) as unknown;

  if (!isNativeSessionRequest(body)) {
    return c.text('Native session request is invalid', 400);
  }
  if (body.redirectUri !== NATIVE_REDIRECT_URI) {
    return c.text('Native session redirectUri is invalid', 400);
  }

  const { clientId, clientSecret } = requireOidcConfig();
  const tokens = await exchangeOidcCode(
    {
      clientId,
      clientSecret,
      code: body.code,
      codeVerifier: body.codeVerifier,
      redirectUri: body.redirectUri,
      tokenUrl: process.env.OIDC_TOKEN_URL ?? DEFAULT_OIDC_TOKEN_URL,
    },
    globalThis.fetch,
  );

  return c.json({ token: await createOidcSession(tokens) });
});
app.all('/login/native/session', methodNotAllowed);

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
app.all('/graphql', methodNotAllowed);

app.on(['GET', 'HEAD'], '*', serveStatic({ root: STATIC_ROOT }));
app.on(['GET', 'HEAD'], '*', (c, next) =>
  acceptsSpa(c.req.header('accept'), c.req.path) ? serveSpaFallback(c, next) : next(),
);

export default app;

function methodNotAllowed(c: Context) {
  c.header('Allow', c.req.path === '/graphql' || c.req.path.endsWith('/session') ? 'POST' : 'GET');
  return c.text('Method Not Allowed', 405);
}

const requireOidcConfig = () => {
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!clientSecret) {
    throw new OidcAuthError(500, 'OIDC client configuration is required');
  }

  return { clientId: requireOidcClientId(), clientSecret };
};

const requireOidcClientId = () => {
  const clientId = process.env.PUBLIC_OIDC_CLIENT_ID;
  if (!clientId) {
    throw new OidcAuthError(500, 'OIDC client configuration is required');
  }

  return clientId;
};

const getPublicOrigin = (requestUrl: URL) =>
  new URL(process.env.PUBLIC_ORIGIN ?? requestUrl.origin);

const isNativeSessionRequest = (
  value: unknown,
): value is { code: string; codeVerifier: string; redirectUri: string } =>
  !!value &&
  typeof value === 'object' &&
  isStringWithin(Reflect.get(value, 'code'), 1, 2048) &&
  typeof Reflect.get(value, 'codeVerifier') === 'string' &&
  PKCE_CODE_VERIFIER.test(Reflect.get(value, 'codeVerifier')) &&
  typeof Reflect.get(value, 'redirectUri') === 'string';

const isStringWithin = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;

const createCodeVerifier = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Buffer.from(bytes).toString('base64url');
};

const createCodeChallenge = async (codeVerifier: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));

  return Buffer.from(digest).toString('base64url');
};

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
