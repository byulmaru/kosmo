import {
  AuthRequest,
  CodeChallengeMethod,
  fetchDiscoveryAsync,
  makeRedirectUri,
  ResponseType,
} from 'expo-auth-session';
import { Platform } from 'react-native';
import { getWebOrigin } from '@/relay/network';
import { getNativeSessionConfiguration } from './nativeConfig';
import type { GestureResponderEvent } from 'react-native';

export type NativeOidcSessionExchangeInput = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export function startWebLogin(): void {
  if (Platform.OS !== 'web') {
    throw new Error('Browser login is only available on web.');
  }

  window.location.assign(`${getWebOrigin()}/login`);
}

export function startWebLoginFromPress(event: GestureResponderEvent): void {
  const pointer = event.nativeEvent as unknown as MouseEvent;
  if (
    (typeof pointer.button === 'number' && pointer.button !== 0) ||
    pointer.altKey ||
    pointer.ctrlKey ||
    pointer.metaKey ||
    pointer.shiftKey
  ) {
    return;
  }

  event.preventDefault();
  startWebLogin();
}

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
