import { findApplicationByClientId } from '@kosmo/core/db';
import { Hono } from 'hono';
import { startOidcLogin } from './oidc';
import type { Context as HonoContext } from 'hono';
import type { Env } from './context';

const authorizeResponseType = 'code';
const supportedCodeChallengeMethod = 'S256';

export const oauth = new Hono<Env>();

oauth.get('/authorize', async (c) => {
  const url = new URL(c.req.url);
  const responseType = url.searchParams.get('response_type');
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');
  const requestedScopes = parseScope(url.searchParams.get('scope'));

  if (responseType !== authorizeResponseType) {
    return oauthError(c, 'unsupported_response_type', 'Only authorization code flow is supported');
  }

  if (!clientId || !redirectUri || !codeChallenge) {
    return oauthError(c, 'invalid_request', 'client_id, redirect_uri, and PKCE are required');
  }

  if (codeChallengeMethod !== supportedCodeChallengeMethod) {
    return oauthError(c, 'invalid_request', 'Only S256 PKCE is supported');
  }

  const application = await findApplicationByClientId(clientId);

  if (!application || application.state !== 'ACTIVE') {
    return oauthError(c, 'invalid_client', 'Unknown or disabled client');
  }

  if (!application.redirectUris.includes(redirectUri)) {
    return oauthError(c, 'invalid_request', 'redirect_uri is not registered for this client');
  }

  const invalidScope = requestedScopes.find((scope) => !application.scopes.includes(scope));

  if (invalidScope) {
    return oauthError(c, 'invalid_scope', `Scope is not allowed: ${invalidScope}`);
  }

  if (!c.var.context.oauth) {
    return startOidcLogin(c, url.toString());
  }

  const consentUrl = new URL('/oauth/consent', Bun.env.EXPO_PUBLIC_ORIGIN);
  consentUrl.searchParams.set('client_id', clientId);
  consentUrl.searchParams.set('redirect_uri', redirectUri);
  consentUrl.searchParams.set('scope', requestedScopes.join(' '));

  return c.redirect(consentUrl.toString());
});

oauth.post('/token', (c) => {
  return c.json(
    {
      error: 'not_implemented',
      error_description:
        'Token exchange storage and refresh-token rotation are not implemented yet',
    },
    501,
  );
});

oauth.post('/revoke', (c) => {
  return c.json(
    {
      error: 'not_implemented',
      error_description: 'Token revocation is not implemented yet',
    },
    501,
  );
});

oauth.get('/jwks', (c) => {
  return c.json({ keys: [] });
});

function parseScope(scope: string | null) {
  return scope?.split(' ').filter(Boolean) ?? [];
}

function oauthError(c: HonoContext<Env>, error: string, errorDescription: string) {
  return c.json({ error, error_description: errorDescription }, 400);
}
