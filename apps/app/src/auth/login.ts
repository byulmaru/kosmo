import {
  AuthRequest,
  CodeChallengeMethod,
  fetchDiscoveryAsync,
  makeRedirectUri,
  ResponseType,
} from 'expo-auth-session';
import { Platform } from 'react-native';
import { getWebOrigin } from '@/relay/network';
import type { GestureResponderEvent } from 'react-native';

type NativeSessionResponse = {
  token?: unknown;
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

export async function startNativeLogin(): Promise<string | null> {
  const issuer = process.env.EXPO_PUBLIC_OIDC_ISSUER;
  const clientId = process.env.EXPO_PUBLIC_OIDC_CLIENT_ID;

  if (!issuer || !clientId) {
    throw new Error('EXPO_PUBLIC_OIDC_ISSUER and EXPO_PUBLIC_OIDC_CLIENT_ID are required.');
  }

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

  const response = await fetch(`${getWebOrigin()}/login/native/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: result.params.code,
      codeVerifier: request.codeVerifier,
      redirectUri,
    }),
  });
  const body = (await response.json().catch(() => null)) as NativeSessionResponse | null;

  if (!response.ok || typeof body?.token !== 'string' || body.token.length === 0) {
    throw new Error('네이티브 세션을 만들지 못했습니다.');
  }

  return body.token;
}
