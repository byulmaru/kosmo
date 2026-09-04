import { getApiOrigin } from '@/config/origin';
import { getPublicConfig } from '@/config/public';
import type { NativeSessionConfiguration } from './sessionToken';

export function getNativeSessionConfiguration(): NativeSessionConfiguration {
  return {
    apiOrigin: getApiOrigin(),
    clientId: getPublicConfig('nativeOidcClientId'),
    issuer: getPublicConfig('oidcIssuer'),
  };
}
