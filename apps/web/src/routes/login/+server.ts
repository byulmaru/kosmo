import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

const OIDC_AUTHORIZE_URL = 'https://id.byulmaru.co/oauth/authorize';
const LOGIN_STATE_COOKIE = 'kosmo_oidc_state';
const LOGIN_CODE_VERIFIER_COOKIE = 'kosmo_oidc_code_verifier';

export const GET: RequestHandler = async ({ cookies, url }) => {
  const state = createCodeVerifier();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const redirectUri = new URL('/login/callback', url.origin).toString();

  cookies.set(LOGIN_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: '/login/callback',
    sameSite: 'lax',
    secure: true,
  });

  cookies.set(LOGIN_CODE_VERIFIER_COOKIE, codeVerifier, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: '/login/callback',
    sameSite: 'lax',
    secure: true,
  });

  const authorizeUrl = new URL(OIDC_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', env.PUBLIC_OIDC_CLIENT_ID!);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', 'openid profile');
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', state);

  redirect(302, authorizeUrl.toString());
};

function createCodeVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Buffer.from(bytes).toString('base64url');
}

async function createCodeChallenge(codeVerifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));

  return Buffer.from(digest).toString('base64url');
}
