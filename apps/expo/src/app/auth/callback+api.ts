import { sessionName } from '@kosmo/core';

const codeVerifierCookieName = 'kosmo_oauth_code_verifier';
const oauthStateCookieName = 'kosmo_oauth_state';
const returnToCookieName = 'kosmo_oauth_return_to';

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export async function GET(request: Request) {
  const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
  const origin = process.env.EXPO_PUBLIC_ORIGIN;
  const clientId = process.env.OAUTH_WEB_CLIENT_ID;

  if (!apiOrigin || !origin || !clientId) {
    return Response.json(
      { error: 'EXPO_PUBLIC_API_ORIGIN, EXPO_PUBLIC_ORIGIN, and OAUTH_WEB_CLIENT_ID are required' },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = getCookie(request, oauthStateCookieName);
  const codeVerifier = getCookie(request, codeVerifierCookieName);
  const returnTo = getCookie(request, returnToCookieName) ?? origin;

  if (!code || !state || !cookieState || state !== cookieState || !codeVerifier) {
    return Response.json({ error: 'invalid_oauth_callback' }, { status: 400 });
  }

  const redirectUri =
    process.env.OAUTH_WEB_REDIRECT_URI ?? new URL('/auth/callback', origin).toString();
  const tokenResponse = await fetch(new URL('/oauth/token', apiOrigin), {
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });
  const tokenJson = (await tokenResponse.json()) as TokenResponse;

  if (!tokenResponse.ok || !tokenJson.access_token) {
    return Response.json(tokenJson, { status: tokenResponse.status });
  }

  const headers = new Headers({ location: returnTo });
  headers.append('set-cookie', createCookie(sessionName, tokenJson.access_token, origin, 60 * 60));
  headers.append('set-cookie', expireCookie(codeVerifierCookieName));
  headers.append('set-cookie', expireCookie(oauthStateCookieName));
  headers.append('set-cookie', expireCookie(returnToCookieName));

  return new Response(null, { headers, status: 302 });
}

function createCookie(name: string, value: string, origin: string, maxAge: number) {
  const secure = new URL(origin).protocol === 'https:' ? '; Secure' : '';

  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function expireCookie(name: string) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
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
