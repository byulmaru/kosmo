const codeVerifierCookieName = 'kosmo_oauth_code_verifier';
const oauthStateCookieName = 'kosmo_oauth_state';
const defaultScopes = 'read:account read:profile read:posts write:posts';

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
  const returnTo = url.searchParams.get('return_to') ?? origin;
  const codeVerifier = randomBase64Url(32);
  const state = randomBase64Url(32);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const redirectUri =
    process.env.OAUTH_WEB_REDIRECT_URI ?? new URL('/auth/callback', origin).toString();
  const authorizeUrl = new URL('/oauth/authorize', apiOrigin);

  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', process.env.OAUTH_WEB_SCOPES ?? defaultScopes);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', state);

  const headers = new Headers({ location: authorizeUrl.toString() });
  headers.append('set-cookie', createCookie(codeVerifierCookieName, codeVerifier, origin));
  headers.append('set-cookie', createCookie(oauthStateCookieName, state, origin));
  headers.append('set-cookie', createCookie('kosmo_oauth_return_to', returnTo, origin));

  return new Response(null, { headers, status: 302 });
}

function createCookie(name: string, value: string, origin: string) {
  const secure = new URL(origin).protocol === 'https:' ? '; Secure' : '';

  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure}`;
}

async function createCodeChallenge(codeVerifier: string) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return base64Url(new Uint8Array(digest));
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
