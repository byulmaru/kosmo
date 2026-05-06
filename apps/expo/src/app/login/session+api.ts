import { sessionName } from '@kosmo/core';
import { Accounts, db, firstOrThrow, Sessions } from '@kosmo/core/db';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { stringifySetCookie } from 'cookie';
import { z } from 'zod';

type TokenResponse = {
  access_token: string;
  id_token: string;
};

export async function POST(request: Request) {
  const result = z
    .object({
      code: z.string().min(1),
      code_verifier: z.string().min(1),
      redirect_uri: z.url(),
      session_type: z.enum(['web', 'app']),
    })
    .safeParse(await request.json().catch(() => undefined));

  if (!result.success) {
    return Response.json({ error: z.prettifyError(result.error) }, { status: 400 });
  }

  const body = result.data;

  const clientId = process.env.EXPO_PUBLIC_OIDC_CLIENT_ID;

  if (!clientId || !process.env.OIDC_CLIENT_SECRET) {
    return Response.json(
      { error: 'EXPO_PUBLIC_OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required' },
      { status: 500 },
    );
  }

  const tokenResponse = await fetch('https://id.byulmaru.co/oauth/token', {
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: process.env.OIDC_CLIENT_SECRET,
      code: body.code,
      code_verifier: body.code_verifier,
      redirect_uri: body.redirect_uri,
    }),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const tokenJson = (await tokenResponse.json()) as TokenResponse;

  if (!tokenResponse.ok || !tokenJson.access_token || !tokenJson.id_token) {
    return Response.json(tokenJson, { status: tokenResponse.status });
  }

  const { sub: idTokenSub, name: displayName } = decodeIdToken(tokenJson.id_token);
  const sessionToken = await db.transaction(async (tx) => {
    const account = await tx
      .insert(Accounts)
      .values({
        oidcSubject: idTokenSub,
        displayName,
        state: AccountState.ACTIVE,
      })
      .onConflictDoUpdate({
        target: [Accounts.oidcSubject],
        set: {
          displayName,
        },
      })
      .returning({ id: Accounts.id })
      .then(firstOrThrow);

    const session = await tx
      .insert(Sessions)
      .values({
        accountId: account.id,
        oidcSessionKey: tokenJson.access_token,
        token: createSessionToken(),
        state: SessionState.ACTIVE,
      })
      .returning({ token: Sessions.token })
      .then(firstOrThrow);

    return session.token;
  });

  if (body.session_type === 'web') {
    return Response.json(
      {},
      {
        headers: {
          'set-cookie': stringifySetCookie(sessionName, sessionToken, {
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
            httpOnly: true,
            sameSite: 'lax',
            secure: true,
          }),
        },
      },
    );
  } else {
    return Response.json({ session_token: sessionToken });
  }
}

function decodeIdToken(idToken: string) {
  const [, payload] = idToken.split('.', 2);

  if (!payload) {
    throw new Error('Invalid id_token');
  }

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  const result = z
    .object({
      sub: z.string().min(1),
      name: z.string(),
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
