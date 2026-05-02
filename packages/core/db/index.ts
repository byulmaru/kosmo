import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Temporal } from 'temporal-polyfill';
import * as schema from './tables';
import type { PgDatabase, PgTransaction } from 'drizzle-orm/pg-core';

const databaseUrl = Bun.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export * from './id';
export * from './tables';
export * from './utils';

export const db = drizzle(databaseUrl, { schema });

export async function findApplicationByClientId(clientId: string) {
  const [application] = await db
    .select()
    .from(schema.Applications)
    .where(eq(schema.Applications.clientId, clientId))
    .limit(1);

  return application;
}

export async function findOAuthTokenByAccessTokenHash(accessTokenHash: string) {
  const [oauthToken] = await db
    .select()
    .from(schema.OAuthTokens)
    .where(eq(schema.OAuthTokens.accessTokenHash, accessTokenHash))
    .limit(1);

  return oauthToken;
}

export function isOAuthTokenUsable(
  oauthToken: Awaited<ReturnType<typeof findOAuthTokenByAccessTokenHash>>,
) {
  if (!oauthToken || oauthToken.state !== 'ACTIVE') {
    return false;
  }

  return oauthToken.expiresAt.epochMilliseconds > Temporal.Now.instant().epochMilliseconds;
}

export type Database = typeof db;
export type Transaction =
  Database extends PgDatabase<infer T, infer U, infer V> ? PgTransaction<T, U, V> : never;
