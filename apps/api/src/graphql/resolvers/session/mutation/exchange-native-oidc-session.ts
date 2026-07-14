import { ValidationError } from '@kosmo/core/error';
import { createOidcSession } from '@kosmo/core/services';
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  AuthorizationResponseError,
  ClientError,
  discovery,
  enableNonRepudiationChecks,
  None,
  ResponseBodyError,
  WWWAuthenticateChallengeError,
} from 'openid-client';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import type { Configuration } from 'openid-client';

const NATIVE_REDIRECT_URI = 'kosmo://login/callback';
const PKCE_CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const nativeSessionInputError = 'Invalid input';

let oidcConfiguration: Promise<Configuration> | undefined;

class NativeSessionExchangeError extends Error {
  constructor(options?: ErrorOptions) {
    super('Native session exchange failed', options);
  }
}

const getOidcConfiguration = () => {
  if (oidcConfiguration) {
    return oidcConfiguration;
  }

  const clientId = process.env.PUBLIC_OIDC_NATIVE_CLIENT_ID;
  const issuer = process.env.PUBLIC_OIDC_ISSUER;
  if (!clientId || !issuer) {
    throw new Error('Native OIDC client configuration is required');
  }

  const issuerUrl = new URL(issuer);
  const execute = [enableNonRepudiationChecks];
  if (
    issuerUrl.protocol === 'http:' &&
    ['127.0.0.1', '[::1]', 'localhost'].includes(issuerUrl.hostname)
  ) {
    execute.push(allowInsecureRequests);
  }

  oidcConfiguration = discovery(issuerUrl, clientId, undefined, None(), { execute }).catch(
    (cause: unknown) => {
      oidcConfiguration = undefined;
      throw cause;
    },
  );

  return oidcConfiguration;
};

const exchangeOidcCode = async ({
  callbackUrl,
  codeVerifier,
}: {
  callbackUrl: URL;
  codeVerifier: string;
}) => {
  try {
    const tokens = await authorizationCodeGrant(await getOidcConfiguration(), callbackUrl, {
      idTokenExpected: true,
      pkceCodeVerifier: codeVerifier,
    });

    const claims = tokens.claims();
    if (
      !claims ||
      typeof claims.name !== 'string' ||
      typeof claims.sub !== 'string' ||
      claims.sub.length < 1
    ) {
      throw new NativeSessionExchangeError();
    }

    return {
      displayName: claims.name,
      oidcSubject: claims.sub,
    };
  } catch (cause) {
    if (cause instanceof NativeSessionExchangeError) {
      throw cause;
    }
    if (
      cause instanceof ResponseBodyError ||
      cause instanceof WWWAuthenticateChallengeError ||
      cause instanceof AuthorizationResponseError
    ) {
      throw new NativeSessionExchangeError({ cause });
    }
    if (
      cause instanceof ClientError &&
      !(cause.cause instanceof Response && cause.cause.status >= 500)
    ) {
      throw new NativeSessionExchangeError({ cause });
    }

    throw cause;
  }
};

builder.mutationField('exchangeNativeOidcSession', (t) =>
  t.fieldWithInput({
    type: builder.simpleObject('ExchangeNativeOidcSessionPayload', {
      fields: (field) => ({
        token: field.string(),
      }),
    }),
    input: {
      code: t.input.string({
        validate: z.string().min(1, nativeSessionInputError).max(2048, nativeSessionInputError),
      }),
      codeVerifier: t.input.string({
        validate: z.string().regex(PKCE_CODE_VERIFIER, nativeSessionInputError),
      }),
      redirectUri: t.input.string({
        validate: z.literal(NATIVE_REDIRECT_URI, nativeSessionInputError),
      }),
    },
    resolve: async (_, { input }, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      try {
        const callbackUrl = new URL(NATIVE_REDIRECT_URI);
        callbackUrl.searchParams.set('code', input.code);
        const token = await createOidcSession(
          await exchangeOidcCode({ callbackUrl, codeVerifier: input.codeVerifier }),
        );

        return { token };
      } catch (cause) {
        if (cause instanceof NativeSessionExchangeError) {
          throw new ValidationError('Native session exchange failed');
        }

        throw cause;
      }
    },
  }),
);
