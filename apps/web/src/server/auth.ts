import {
  AccountProfiles,
  Accounts,
  db,
  first,
  firstOrThrow,
  Profiles,
  Sessions,
} from '@kosmo/core/db';
import { AccountState, ProfileState, SessionState } from '@kosmo/core/enums';
import { and, desc, eq } from 'drizzle-orm';

export const DEFAULT_OIDC_AUTHORIZE_URL = 'https://id.byulmaru.co/oauth/authorize';
export const DEFAULT_OIDC_TOKEN_URL = 'https://id.byulmaru.co/oauth/token';
export const LOGIN_CODE_VERIFIER_COOKIE = 'kosmo_oidc_code_verifier';
export const LOGIN_STATE_COOKIE = 'kosmo_oidc_state';
export const NATIVE_REDIRECT_URI = 'kosmo://login/callback';

export type OidcTokens = {
  accessToken: string;
  idToken: string;
};

export class OidcAuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const exchangeOidcCode = async (
  {
    clientId,
    clientSecret,
    code,
    codeVerifier,
    redirectUri,
    tokenUrl = DEFAULT_OIDC_TOKEN_URL,
  }: {
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
    tokenUrl?: string;
  },
  fetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<OidcTokens> => {
  const response = await fetch(tokenUrl, {
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const json = (await response.json().catch(() => undefined)) as
    | { access_token?: string; id_token?: string }
    | undefined;

  if (!response.ok || !json?.access_token || !json.id_token) {
    const status = response.status >= 400 && response.status <= 599 ? response.status : 400;

    throw new OidcAuthError(status, 'OIDC code exchange failed');
  }

  return { accessToken: json.access_token, idToken: json.id_token };
};

export const createOidcSession = async ({ accessToken, idToken }: OidcTokens) => {
  const { sub: oidcSubject, name: displayName } = decodeLegacyIdTokenClaims(idToken);

  return db.transaction(async (tx) => {
    const account = await tx
      .insert(Accounts)
      .values({
        displayName,
        oidcSubject,
        state: AccountState.ACTIVE,
      })
      .onConflictDoUpdate({
        target: [Accounts.oidcSubject],
        set: { displayName },
      })
      .returning({ id: Accounts.id })
      .then(firstOrThrow);

    const activeProfile = await tx
      .select({ id: Profiles.id })
      .from(Profiles)
      .innerJoin(
        AccountProfiles,
        and(eq(AccountProfiles.profileId, Profiles.id), eq(AccountProfiles.accountId, account.id)),
      )
      .where(eq(Profiles.state, ProfileState.ACTIVE))
      .orderBy(desc(Profiles.id))
      .limit(1)
      .then(first);

    return tx
      .insert(Sessions)
      .values({
        accountId: account.id,
        activeProfileId: activeProfile?.id ?? null,
        oidcSessionKey: accessToken,
        state: SessionState.ACTIVE,
        token: createSessionToken(),
      })
      .returning({ token: Sessions.token })
      .then(firstOrThrow)
      .then((session) => session.token);
  });
};

const decodeLegacyIdTokenClaims = (idToken: string) => {
  // TODO(PROD-246): Replace this payload-only boundary with cryptographic token validation.
  const [, payload] = idToken.split('.', 2);

  if (!payload) {
    throw new OidcAuthError(400, 'Invalid id_token');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new OidcAuthError(400, 'Invalid id_token payload');
  }

  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof Reflect.get(decoded, 'name') !== 'string' ||
    typeof Reflect.get(decoded, 'sub') !== 'string' ||
    Reflect.get(decoded, 'sub').length < 1
  ) {
    throw new OidcAuthError(400, 'Invalid id_token payload');
  }

  return {
    name: Reflect.get(decoded, 'name') as string,
    sub: Reflect.get(decoded, 'sub') as string,
  };
};

const createSessionToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Buffer.from(bytes).toString('base64url');
};
