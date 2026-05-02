import { findOAuthTokenByAccessTokenHash, isOAuthTokenUsable } from '@kosmo/core/db';
import { createMiddleware } from 'hono/factory';
import type { Context, Env } from './context';

const bearerPrefix = 'Bearer ';

export const initializeContext = createMiddleware<Env>(async (c, next) => {
  const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const context: Context = {
    ip: forwardedFor || c.req.header('x-real-ip') || '0.0.0.0',
  };

  c.set('context', context);

  await next();
});

export const authenticateBearerToken = createMiddleware<Env>(async (c, next) => {
  const authorization = c.req.header('authorization');

  if (!authorization?.startsWith(bearerPrefix)) {
    await next();
    return;
  }

  const token = authorization.slice(bearerPrefix.length).trim();

  if (!token) {
    await next();
    return;
  }

  const oauthToken = await findOAuthTokenByAccessTokenHash(await hashToken(token));

  if (isOAuthTokenUsable(oauthToken)) {
    c.var.context.oauth = {
      tokenId: oauthToken.id,
      accountId: oauthToken.accountId,
      applicationId: oauthToken.applicationId,
      ...(oauthToken.profileId && { profileId: oauthToken.profileId }),
      scopes: oauthToken.scopes,
    };
  }

  await next();
});

export async function hashToken(token: string) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
