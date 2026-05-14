import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMocks = vi.hoisted(() => ({
  privateEnv: { OIDC_CLIENT_SECRET: 'web-secret' },
  publicEnv: { PUBLIC_OIDC_CLIENT_ID: 'web-client' },
}));

vi.mock('$env/dynamic/private', () => ({ env: envMocks.privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: envMocks.publicEnv }));

vi.mock('@kosmo/core/db', () => ({
  Accounts: {
    displayName: 'displayName',
    id: 'accountId',
    oidcSubject: 'oidcSubject',
    state: 'accountState',
  },
  Sessions: { token: 'sessionToken' },
  db: {
    transaction: vi.fn(async (callback) => callback(createTransactionMock())),
  },
  firstOrThrow: vi.fn((rows) => rows[0]),
}));

const { db } = await import('@kosmo/core/db');
const loginRoute = await import('./+server');
const callbackRoute = await import('./callback/+server');

describe('/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMocks.publicEnv.PUBLIC_OIDC_CLIENT_ID = 'web-client';
  });

  it('sets PKCE cookies and redirects to the OIDC authorization endpoint', async () => {
    expect.assertions(10);

    const cookies = createCookiesMock();

    await expect(
      loginRoute.GET({
        cookies,
        url: new URL('https://kos.moe/login'),
      } as Parameters<typeof loginRoute.GET>[0]),
    ).rejects.toMatchObject({ status: 302 });

    const thrown = await getThrownRedirect(() =>
      loginRoute.GET({
        cookies: createCookiesMock(),
        url: new URL('https://kos.moe/login'),
      } as Parameters<typeof loginRoute.GET>[0]),
    );
    const location = new URL(thrown.location);

    expect(location.origin + location.pathname).toBe('https://id.byulmaru.co/oauth/authorize');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('client_id')).toBe('web-client');
    expect(location.searchParams.get('redirect_uri')).toBe('https://kos.moe/login/callback');
    expect(location.searchParams.get('scope')).toBe('openid profile');
    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(cookies.set).toHaveBeenCalledTimes(2);
  });
});

describe('/login/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMocks.privateEnv.OIDC_CLIENT_SECRET = 'web-secret';
    envMocks.publicEnv.PUBLIC_OIDC_CLIENT_ID = 'web-client';
  });

  it('rejects a native-shaped callback without web PKCE cookies', async () => {
    expect.assertions(2);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      callbackRoute.GET({
        cookies: createCookiesMock(),
        url: new URL(
          'https://kos.moe/login/callback?code=auth-code&state=native-state&code_verifier=native-verifier&redirect_uri=kosmo%3A%2F%2Flogin%2Fcallback',
        ),
      } as Parameters<typeof callbackRoute.GET>[0]),
    ).rejects.toMatchObject({ status: 400 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges the code with the web PKCE cookie and sets a session cookie', async () => {
    expect.assertions(9);

    const cookies = createCookiesMock({
      kosmo_oidc_code_verifier: 'web-verifier',
      kosmo_oidc_state: 'web-state',
    });
    const idToken = createIdToken({ name: 'Kosmo User', sub: 'oidc-subject' });
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: 'oidc-access-token', id_token: idToken }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      callbackRoute.GET({
        cookies,
        url: new URL('https://kos.moe/login/callback?code=auth-code&state=web-state'),
      } as Parameters<typeof callbackRoute.GET>[0]),
    ).rejects.toMatchObject({ location: '/', status: 302 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      client_id: 'web-client',
      client_secret: 'web-secret',
      code: 'auth-code',
      code_verifier: 'web-verifier',
      grant_type: 'authorization_code',
      redirect_uri: 'https://kos.moe/login/callback',
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(cookies.delete).toHaveBeenCalledWith('kosmo_oidc_state', {
      path: '/login/callback',
    });
    expect(cookies.delete).toHaveBeenCalledWith('kosmo_oidc_code_verifier', {
      path: '/login/callback',
    });
    expect(cookies.set).toHaveBeenCalledWith('kosmo_session', expect.any(String), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
    expect(cookies.get).toHaveBeenCalledWith('kosmo_oidc_state');
    expect(cookies.get).toHaveBeenCalledWith('kosmo_oidc_code_verifier');
  });
});

function createCookiesMock(values: Record<string, string> = {}) {
  return {
    delete: vi.fn(),
    get: vi.fn((name: string) => values[name]),
    set: vi.fn(),
  };
}

async function getThrownRedirect(callback: () => Promise<unknown>) {
  try {
    await callback();
  } catch (error) {
    return error as { location: string; status: number };
  }

  throw new Error('Expected redirect');
}

function createTransactionMock() {
  return {
    insert: vi.fn((table) => ({
      values: vi.fn((values) => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'account-id' }])),
        })),
        returning: vi.fn(() => Promise.resolve([{ token: values.token ?? 'session-token' }])),
      })),
      table,
    })),
  };
}

function createIdToken(payload: object) {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    '',
  ].join('.');
}
