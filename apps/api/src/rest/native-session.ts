import { createOidcSession, db } from '@kosmo/core/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
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
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Configuration } from 'openid-client';
import type { Env } from '../context';

const NATIVE_REDIRECT_URI = 'kosmo://login/callback';
const NATIVE_SESSION_BODY_MAX_SIZE = 16 * 1024;
const PKCE_CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

let oidcConfiguration: Promise<Configuration> | undefined;

class NativeSessionError extends Error {
  constructor(
    readonly status: number,
    options?: ErrorOptions,
  ) {
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
    throw new NativeSessionError(500);
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
  let tokens;
  try {
    tokens = await authorizationCodeGrant(await getOidcConfiguration(), callbackUrl, {
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
      throw new NativeSessionError(400);
    }

    return {
      displayName: claims.name,
      oidcSubject: claims.sub,
    };
  } catch (cause) {
    if (cause instanceof NativeSessionError) {
      throw cause;
    }
    if (cause instanceof ResponseBodyError || cause instanceof WWWAuthenticateChallengeError) {
      throw new NativeSessionError(cause.status, { cause });
    }
    if (cause instanceof ClientError) {
      const status =
        cause.code === 'OAUTH_TIMEOUT'
          ? 504
          : cause.cause instanceof Response && cause.cause.status >= 500
            ? 502
            : 400;
      throw new NativeSessionError(status, { cause });
    }
    if (cause instanceof AuthorizationResponseError) {
      throw new NativeSessionError(400, { cause });
    }

    throw new NativeSessionError(502, { cause });
  }
};

export const nativeSession = new Hono<Env>();

nativeSession.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  await next();
});

nativeSession.post(
  '/login/native/session',
  bodyLimit({
    maxSize: NATIVE_SESSION_BODY_MAX_SIZE,
    onError: (c) => c.text('Payload Too Large', 413),
  }),
  async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as unknown;
    const input = body && typeof body === 'object' ? body : {};
    const code = Reflect.get(input, 'code');
    const codeVerifier = Reflect.get(input, 'codeVerifier');
    const redirectUri = Reflect.get(input, 'redirectUri');

    if (
      typeof code !== 'string' ||
      code.length < 1 ||
      code.length > 2048 ||
      typeof codeVerifier !== 'string' ||
      !PKCE_CODE_VERIFIER.test(codeVerifier) ||
      redirectUri !== NATIVE_REDIRECT_URI
    ) {
      return c.text('Native session request is invalid', 400);
    }

    try {
      const callbackUrl = new URL(NATIVE_REDIRECT_URI);
      callbackUrl.searchParams.set('code', code);
      const token = await createOidcSession(
        db,
        await exchangeOidcCode({ callbackUrl, codeVerifier }),
      );

      return c.json({ token });
    } catch (cause) {
      const status = cause instanceof NativeSessionError ? cause.status : 500;
      return c.text('Native session exchange failed', status as ContentfulStatusCode);
    }
  },
);

nativeSession.all('/login/native/session', (c) =>
  c.text('Method Not Allowed', 405, { Allow: 'POST' }),
);
