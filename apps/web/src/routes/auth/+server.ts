import { redirect } from '@sveltejs/kit';
import qs from 'query-string';
import { base64url } from 'rfc4648';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const GET = async ({ cookies }) => {
  const OAuthState = base64url.stringify(
    Buffer.from(
      JSON.stringify({
        token: crypto.randomUUID(),
      }),
    ),
    { pad: false },
  );

  cookies.set('oauth-state', OAuthState, {
    path: '/',
    httpOnly: true,
  });

  return redirect(
    303,
    qs.stringifyUrl({
      url: 'https://byulmaru.co/oauth/authorize',
      query: {
        response_type: 'code',
        client_id: privateEnv.BYULMARU_ID_CLIENT_ID,
        redirect_uri: `${publicEnv.PUBLIC_WEB_DOMAIN}/auth/callback`,
        scope: 'openid profile email',
        state: OAuthState,
      },
    }),
  );
};
