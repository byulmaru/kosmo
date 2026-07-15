import { getApiOrigin } from '@/relay/network';
import type { NativeSessionConfiguration } from './sessionToken';

export function getNativeSessionConfiguration(): NativeSessionConfiguration {
  const issuer = process.env.EXPO_PUBLIC_OIDC_ISSUER;
  const clientId = process.env.EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID;

  if (!issuer || !clientId) {
    throw new Error('EXPO_PUBLIC_OIDC_ISSUER and EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID are required.');
  }

  return { apiOrigin: getApiOrigin(), clientId, issuer };
}
