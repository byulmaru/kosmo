import { sessionName } from '@kosmo/core';
import { createOidcSession } from '@kosmo/core/services';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import {
  exchangeOidcCode,
  getOidcConfiguration,
  LOGIN_CODE_VERIFIER_COOKIE,
  LOGIN_STATE_COOKIE,
} from '../auth';

const LOGIN_COOKIE_MAX_AGE = 60 * 10;
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const loginRoutes = new Hono();

loginRoutes.get('/login', async (c) => {
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
loginRoutes.all('/login', (c) => c.text('Method Not Allowed', 405, { Allow: 'GET' }));

loginRoutes.get('/login/callback', async (c) => {
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
loginRoutes.all('/login/callback', (c) => c.text('Method Not Allowed', 405, { Allow: 'GET' }));

export default loginRoutes;
