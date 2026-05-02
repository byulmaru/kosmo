import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import type { Env } from './context';

const oidcReturnToCookieName = 'kosmo_oidc_return_to';
const oidcStateCookieName = 'kosmo_oidc_state';

export const oidc = new Hono<Env>();

oidc.get('/oidc/callback', (c) => {
  const url = new URL(c.req.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const cookieState = getCookie(c.req.raw, oidcStateCookieName);

  if (!code || !state || state !== cookieState) {
    return c.json({ error: 'invalid_oidc_callback' }, 400);
  }

  return c.json(
    {
      error: 'not_implemented',
      error_description:
        'OIDC code exchange and Kosmo browser session creation are not implemented yet',
    },
    501,
  );
});

export function startOidcLogin(c: HonoContext<Env>, returnTo: string) {
  const oidcIssuer = Bun.env.OIDC_ISSUER;
  const oidcClientId = Bun.env.OIDC_CLIENT_ID;
  const oidcRedirectUri = Bun.env.OIDC_REDIRECT_URI;

  if (!oidcIssuer || !oidcClientId || !oidcRedirectUri) {
    return c.json(
      { error: 'OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_REDIRECT_URI are required' },
      500,
    );
  }

  const state = randomBase64Url(32);
  const authorizeUrl = new URL('/authorize', oidcIssuer);
  const headers = new Headers({ location: authorizeUrl.toString() });

  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', oidcClientId);
  authorizeUrl.searchParams.set('redirect_uri', oidcRedirectUri);
  authorizeUrl.searchParams.set('scope', 'openid profile');
  authorizeUrl.searchParams.set('state', state);

  headers.set('location', authorizeUrl.toString());
  headers.append('set-cookie', createCookie(c, oidcStateCookieName, state));
  headers.append('set-cookie', createCookie(c, oidcReturnToCookieName, returnTo));

  return new Response(null, { headers, status: 302 });
}

function createCookie(c: HonoContext<Env>, name: string, value: string) {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';

  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure}`;
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return undefined;
  }

  const cookiePrefix = `${name}=`;
  const cookie = cookieHeader.split(';').find((part) => part.trim().startsWith(cookiePrefix));
  const value = cookie?.trim().slice(cookiePrefix.length);

  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
