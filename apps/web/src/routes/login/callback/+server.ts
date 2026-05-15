import { sessionName } from '@kosmo/core';
import { Accounts, db, firstOrThrow, Sessions } from '@kosmo/core/db';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

const LOGIN_STATE_COOKIE = 'kosmo_oidc_state';
const LOGIN_CODE_VERIFIER_COOKIE = 'kosmo_oidc_code_verifier';
const OIDC_TOKEN_URL = 'https://id.byulmaru.co/oauth/token';
const NATIVE_REDIRECT_URI = 'kosmo://login/callback';

type TokenResponse = {
  access_token?: string;
  id_token?: string;
};

export const GET: RequestHandler = async ({ cookies, url }) => {
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (!code || !returnedState) {
    error(400, 'OIDC callback is missing code or state');
  }

  const webState = cookies.get(LOGIN_STATE_COOKIE);
  const webCodeVerifier = cookies.get(LOGIN_CODE_VERIFIER_COOKIE);

  if (!webState || !webCodeVerifier || returnedState !== webState) {
    error(400, 'OIDC callback state is invalid');
  }

  if (!publicEnv.PUBLIC_OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) {
    error(500, 'OIDC client configuration is required');
  }

  const redirectUri =
    url.searchParams.get('redirect_uri') ?? new URL('/login/callback', url.origin).toString();

  if (
    redirectUri !== NATIVE_REDIRECT_URI &&
    redirectUri !== new URL('/login/callback', url.origin).toString()
  ) {
    error(400, 'OIDC callback redirect_uri is invalid');
  }

  const tokenResponse = await fetch(OIDC_TOKEN_URL, {
    body: JSON.stringify({
      client_id: publicEnv.PUBLIC_OIDC_CLIENT_ID,
      client_secret: env.OIDC_CLIENT_SECRET,
      code,
      code_verifier: webCodeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const tokenJson = (await tokenResponse.json().catch(() => undefined)) as
    | TokenResponse
    | undefined;

  if (!tokenResponse.ok || !tokenJson?.access_token || !tokenJson.id_token) {
    error(tokenResponse.status || 400, 'OIDC code exchange failed');
  }

  const { sub: oidcSubject, name: displayName } = decodeIdToken(tokenJson.id_token);
  const sessionToken = await db.transaction(async (tx) => {
    const account = await tx
      .insert(Accounts)
      .values({
        displayName,
        oidcSubject,
        state: AccountState.ACTIVE,
      })
      .onConflictDoUpdate({
        target: [Accounts.oidcSubject],
        set: { displayName },
      })
      .returning({ id: Accounts.id })
      .then(firstOrThrow);

    const session = await tx
      .insert(Sessions)
      .values({
        accountId: account.id,
        oidcSessionKey: tokenJson.access_token,
        state: SessionState.ACTIVE,
        token: createSessionToken(),
      })
      .returning({ token: Sessions.token })
      .then(firstOrThrow);

    return session.token;
  });

  cookies.delete(LOGIN_STATE_COOKIE, { path: '/login/callback' });
  cookies.delete(LOGIN_CODE_VERIFIER_COOKIE, { path: '/login/callback' });
  cookies.set(sessionName, sessionToken, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    secure: url.protocol === 'https:',
  });

  redirect(302, '/');
};

function decodeIdToken(idToken: string) {
  const [, payload] = idToken.split('.', 2);

  if (!payload) {
    error(400, 'Invalid id_token');
  }

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  const result = z
    .object({
      name: z.string(),
      sub: z.string().min(1),
    })
    .safeParse(decoded);

  if (!result.success) {
    error(400, 'Invalid id_token payload');
  }

  return result.data;
}

function createSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Buffer.from(bytes).toString('base64url');
}
