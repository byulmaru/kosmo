import {
  AuthRequest,
  CodeChallengeMethod,
  fetchDiscoveryAsync,
  makeRedirectUri,
  ResponseType,
} from 'expo-auth-session';
import { getNativeSessionConfiguration } from './nativeConfig';

export type NativeOidcSessionExchangeInput = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export async function startNativeAuthorization(): Promise<NativeOidcSessionExchangeInput | null> {
  const { clientId, issuer } = getNativeSessionConfiguration();

  const redirectUri = makeRedirectUri({
    native: 'kosmo://login/callback',
    path: 'login/callback',
    scheme: 'kosmo',
  });
  const discovery = await fetchDiscoveryAsync(issuer);
  const request = new AuthRequest({
    clientId,
    codeChallengeMethod: CodeChallengeMethod.S256,
    redirectUri,
    responseType: ResponseType.Code,
    scopes: ['openid', 'profile'],
    usePKCE: true,
  });
  const result = await request.promptAsync(discovery);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return null;
  }

  if (result.type !== 'success' || !result.params.code || !request.codeVerifier) {
    throw new Error('로그인 승인을 완료하지 못했습니다.');
  }

  return {
    code: result.params.code,
    codeVerifier: request.codeVerifier,
    redirectUri,
  };
}
