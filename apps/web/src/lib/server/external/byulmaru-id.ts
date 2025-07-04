import { decodeJwt } from 'jose';
import ky from 'ky';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const api = ky.create({
  prefixUrl: 'https://id.byulmaru.co',
});

type GetTokensParams = {
  code: string;
};

export const getTokens = async ({ code }: GetTokensParams) => {
  const { access_token, id_token } = await api
    .post('oauth/token', {
      json: {
        grant_type: 'authorization_code',
        code,
        client_id: privateEnv.BYULMARU_ID_CLIENT_ID,
        client_secret: privateEnv.BYULMARU_ID_CLIENT_SECRET,
        redirect_uri: `${publicEnv.PUBLIC_WEB_DOMAIN}/auth/callback`,
        scope: 'openid email profile',
      },
    })
    .then((res) => res.json() as Promise<{ access_token: string; id_token: string }>);

  return {
    accessToken: access_token,
    userInfo: decodeJwt(id_token) as { sub: string; email: string; name: string },
  };
};
