import {
  allowInsecureRequests,
  authorizationCodeGrant,
  AuthorizationResponseError,
  ClientError,
  discovery,
  enableNonRepudiationChecks,
  ResponseBodyError,
  WWWAuthenticateChallengeError,
} from 'openid-client';
import type { Configuration } from 'openid-client';

export const LOGIN_CODE_VERIFIER_COOKIE = 'kosmo_oidc_code_verifier';
export const LOGIN_STATE_COOKIE = 'kosmo_oidc_state';

type OidcIdentity = {
  displayName: string;
  oidcSubject: string;
};

let oidcConfiguration: Promise<Configuration> | undefined;

export class OidcAuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export const getOidcConfiguration = () => {
  if (oidcConfiguration) {
    return oidcConfiguration;
  }

  const clientId = process.env.PUBLIC_OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const issuer = process.env.PUBLIC_OIDC_ISSUER;
  if (!clientId || !clientSecret || !issuer) {
    throw new OidcAuthError(500, 'OIDC client configuration is required');
  }

  const issuerUrl = new URL(issuer);
  const execute = [enableNonRepudiationChecks];
  if (
    issuerUrl.protocol === 'http:' &&
    ['127.0.0.1', '[::1]', 'localhost'].includes(issuerUrl.hostname)
  ) {
    execute.push(allowInsecureRequests);
  }

  oidcConfiguration = discovery(issuerUrl, clientId, clientSecret, undefined, { execute }).catch(
    (cause: unknown) => {
      oidcConfiguration = undefined;
      throw cause;
    },
  );

  return oidcConfiguration;
};

export const exchangeOidcCode = async ({
  callbackUrl,
  codeVerifier,
  expectedState,
}: {
  callbackUrl: URL;
  codeVerifier: string;
  expectedState?: string;
}): Promise<OidcIdentity> => {
  const configuration = await getOidcConfiguration();
  let tokens;
  try {
    tokens = await authorizationCodeGrant(configuration, callbackUrl, {
      expectedState,
      idTokenExpected: true,
      pkceCodeVerifier: codeVerifier,
    });
  } catch (cause) {
    if (cause instanceof ResponseBodyError || cause instanceof WWWAuthenticateChallengeError) {
      throw new OidcAuthError(cause.status, 'OIDC code exchange failed', { cause });
    }
    if (cause instanceof ClientError) {
      let status = 400;
      if (cause.code === 'OAUTH_TIMEOUT') {
        status = 504;
      } else if (cause.cause instanceof Response) {
        status = cause.cause.status >= 500 ? cause.cause.status : 502;
      }
      throw new OidcAuthError(status, 'OIDC code exchange failed', { cause });
    }
    if (cause instanceof AuthorizationResponseError) {
      throw new OidcAuthError(400, 'OIDC code exchange failed', { cause });
    }

    throw cause;
  }

  const claims = tokens.claims();
  if (
    !claims ||
    typeof claims.name !== 'string' ||
    typeof claims.sub !== 'string' ||
    claims.sub.length < 1
  ) {
    throw new OidcAuthError(400, 'Invalid id_token claims');
  }

  return {
    displayName: claims.name,
    oidcSubject: claims.sub,
  };
};
