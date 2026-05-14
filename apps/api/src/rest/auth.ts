import { Accounts, db, firstOrThrow, Sessions } from '@kosmo/core/db';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { Env } from '../context';

type TokenResponse = {
  access_token: string;
  id_token: string;
};

export const auth = new Hono<Env>();

auth.use(
  '*',
  cors({
    allowHeaders: ['Content-Type'],
    allowMethods: ['POST', 'OPTIONS'],
    origin: '*',
  }),
);

auth.post('/', async (c) => {
  const result = z
    .object({
      code: z.string().min(1),
      code_verifier: z.string().min(1),
      redirect_uri: z.url(),
    })
    .safeParse(await c.req.json().catch(() => undefined));

  if (!result.success) {
    return c.json({ error: z.prettifyError(result.error) }, 400);
  }

  if (!process.env.PUBLIC_OIDC_CLIENT_ID || !process.env.OIDC_CLIENT_SECRET) {
    return c.json({ error: 'PUBLIC_OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required' }, 500);
  }

  const body = result.data;
  console.log({
    grant_type: 'authorization_code',
    client_id: process.env.PUBLIC_OIDC_CLIENT_ID,
    client_secret: process.env.OIDC_CLIENT_SECRET,
    code: body.code,
    code_verifier: body.code_verifier,
    redirect_uri: body.redirect_uri,
  });
  const tokenResponse = await fetch('https://id.byulmaru.co/oauth/token', {
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.PUBLIC_OIDC_CLIENT_ID,
      client_secret: process.env.OIDC_CLIENT_SECRET,
      code: body.code,
      code_verifier: body.code_verifier,
      redirect_uri: body.redirect_uri,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const tokenJson = (await tokenResponse.json()) as TokenResponse;

  if (!tokenResponse.ok || !tokenJson.access_token || !tokenJson.id_token) {
    return c.json(tokenJson, tokenResponse.status as 400);
  }

  const { sub: idTokenSub, name: displayName } = decodeIdToken(tokenJson.id_token);
  const sessionToken = await db.transaction(async (tx) => {
    const account = await tx
      .insert(Accounts)
      .values({
        displayName,
        oidcSubject: idTokenSub,
        state: AccountState.ACTIVE,
      })
      .onConflictDoUpdate({
        target: [Accounts.oidcSubject],
        set: { displayName },
      })
      .returning({ id: Accounts.id })
      .then(firstOrThrow);

    const session = await tx
      .insert(Sessions)
      .values({
        accountId: account.id,
        oidcSessionKey: tokenJson.access_token,
        state: SessionState.ACTIVE,
        token: createSessionToken(),
      })
      .returning({ token: Sessions.token })
      .then(firstOrThrow);

    return session.token;
  });

  return c.json({ session_token: sessionToken });
});

function decodeIdToken(idToken: string) {
  const [, payload] = idToken.split('.', 2);

  if (!payload) {
    throw new Error('Invalid id_token');
  }

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  const result = z
    .object({
      name: z.string(),
      sub: z.string().min(1),
    })
    .safeParse(decoded);

  if (!result.success) {
    throw new Error('Invalid id_token payload');
  }

  return result.data;
}

function createSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Buffer.from(bytes).toString('base64url');
}
