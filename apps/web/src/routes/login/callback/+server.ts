import { sessionName } from '@kosmo/core';
import { error, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

const LOGIN_STATE_COOKIE = 'kosmo_oidc_state';
const LOGIN_CODE_VERIFIER_COOKIE = 'kosmo_oidc_code_verifier';

const nativeCallbackSchema = z.object({
  code: z.string().min(1),
  code_verifier: z.string().min(1),
  redirect_uri: z.url(),
  state: z.string().min(1),
});

export const GET: RequestHandler = async ({ cookies, url }) => {
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (!code || !returnedState) {
    error(400, 'OIDC callback is missing code or state');
  }

  const nativeCallback = nativeCallbackSchema.safeParse({
    code,
    code_verifier: url.searchParams.get('code_verifier'),
    redirect_uri: url.searchParams.get('redirect_uri'),
    state: returnedState,
  });

  const webState = cookies.get(LOGIN_STATE_COOKIE);
  const webCodeVerifier = cookies.get(LOGIN_CODE_VERIFIER_COOKIE);
  const isNativeCallback = nativeCallback.success;

  if (!isNativeCallback && (!webState || !webCodeVerifier || returnedState !== webState)) {
    error(400, 'OIDC callback state is invalid');
  }

  const response = await fetch(new URL('/auth', env.PUBLIC_API_ORIGIN), {
    body: JSON.stringify(
      isNativeCallback
        ? {
            code: nativeCallback.data.code,
            code_verifier: nativeCallback.data.code_verifier,
            redirect_uri: nativeCallback.data.redirect_uri,
          }
        : {
            code,
            code_verifier: webCodeVerifier,
            redirect_uri: new URL('/login/callback', url.origin).toString(),
          },
    ),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const body = (await response.json().catch(() => undefined)) as
    | { session_token?: string }
    | undefined;

  if (!response.ok || !body?.session_token) {
    error(response.status || 400, 'OIDC code exchange failed');
  }

  cookies.delete(LOGIN_STATE_COOKIE, { path: '/login/callback' });
  cookies.delete(LOGIN_CODE_VERIFIER_COOKIE, { path: '/login/callback' });
  cookies.set(sessionName, body.session_token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
    sameSite: 'lax',
    secure: true,
  });

  redirect(302, '/');
};
