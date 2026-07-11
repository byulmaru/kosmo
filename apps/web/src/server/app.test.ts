import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { federation } from '@kosmo/fedify';
import type { Hono } from 'hono';

const { createSession, federationFetch } = vi.hoisted(() => ({
  createSession: vi.fn<(tokens: { accessToken: string; idToken: string }) => Promise<string>>(),
  federationFetch: vi.fn<typeof federation.fetch>(),
}));

vi.mock('./auth', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  createOidcSession: createSession,
}));

vi.mock('@kosmo/fedify', () => ({
  federation: { fetch: federationFetch },
}));

let staticRoot: string;
let app: Hono;
let fetch = vi.fn<typeof globalThis.fetch>();

beforeAll(async () => {
  staticRoot = await mkdtemp(join(tmpdir(), 'kosmo-web-server-'));
  await writeFile(join(staticRoot, 'index.html'), '<html>expo app</html>');
  await writeFile(join(staticRoot, 'asset.js'), 'console.log("asset")');
  vi.stubEnv('EXPO_WEB_ROOT', staticRoot);
  ({ default: app } = await import('./app'));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OIDC_AUTHORIZE_URL', 'https://id.example/oauth/authorize');
  vi.stubEnv('PUBLIC_OIDC_CLIENT_ID', 'kosmo-client');
  vi.stubEnv('OIDC_CLIENT_SECRET', 'kosmo-secret');
  vi.stubEnv('OIDC_TOKEN_URL', 'https://id.example/oauth/token');
  vi.stubEnv('PUBLIC_API_ORIGIN', 'https://api.example');
  vi.stubEnv('PUBLIC_ORIGIN', undefined);
  createSession.mockResolvedValue('kosmo-session-token');
  federationFetch.mockImplementation(async (request, options) => {
    if (!options.onNotFound) {
      throw new Error('Missing federation fallback');
    }

    return options.onNotFound(request);
  });
  fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ access_token: 'oidc-access-token', id_token: createIdToken() }),
  );
  vi.stubGlobal('fetch', fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(staticRoot, { force: true, recursive: true });
});

describe('browser login', () => {
  test('starts PKCE login and preserves the browser cookie contract', async () => {
    const response = await app.request('https://kos.moe/login', {
      headers: { 'User-Agent': 'KosmoApp/0.0.1' },
    });
    const location = new URL(response.headers.get('location') ?? '');
    const setCookie = response.headers.get('set-cookie') ?? '';
    const verifier = getCookieValue(setCookie, 'kosmo_oidc_code_verifier');

    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://id.example/oauth/authorize');
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: 'kosmo-client',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      redirect_uri: 'https://kos.moe/login/callback',
      response_type: 'code',
      scope: 'openid profile',
      state: getCookieValue(setCookie, 'kosmo_oidc_state'),
    });
    expect(setCookie).toContain('Max-Age=600');
    expect(setCookie).toContain('Path=/login/callback');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Secure');
  });

  test('keeps local HTTP login cookies usable', async () => {
    const response = await app.request('http://127.0.0.1:4173/login');
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(302);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).not.toContain('Secure');
  });

  test('uses the public origin when TLS terminates before the Node server', async () => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://kos.moe');
    const login = await app.request('http://web:8080/login');
    const loginCookies = login.headers.get('set-cookie') ?? '';
    const loginLocation = new URL(login.headers.get('location') ?? '');
    const state = getCookieValue(loginCookies, 'kosmo_oidc_state');
    const callback = await app.request(`http://web:8080/login/callback?code=code&state=${state}`, {
      headers: { cookie: cookieHeader(loginCookies) },
    });
    const tokenRequest = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<
      string,
      string
    >;

    expect(loginLocation.searchParams.get('redirect_uri')).toBe('https://kos.moe/login/callback');
    expect(loginCookies).toContain('Secure');
    expect(tokenRequest.redirect_uri).toBe('https://kos.moe/login/callback');
    expect(callback.headers.get('set-cookie')).toContain('Secure');
  });

  test('exchanges a valid callback and sets the existing session cookie', async () => {
    const login = await app.request('https://kos.moe/login');
    const loginCookies = login.headers.get('set-cookie') ?? '';
    const state = getCookieValue(loginCookies, 'kosmo_oidc_state');
    const verifier = getCookieValue(loginCookies, 'kosmo_oidc_code_verifier');
    const response = await app.request(
      `https://kos.moe/login/callback?code=oidc-code&state=${state}`,
      { headers: { cookie: cookieHeader(loginCookies) } },
    );
    const tokenRequest = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<
      string,
      string
    >;
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://id.example/oauth/token');
    expect(tokenRequest).toEqual({
      client_id: 'kosmo-client',
      client_secret: 'kosmo-secret',
      code: 'oidc-code',
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: 'https://kos.moe/login/callback',
    });
    expect(createSession).toHaveBeenCalledWith({
      accessToken: 'oidc-access-token',
      idToken: createIdToken(),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/home');
    expect(setCookie).toContain('kosmo_session=kosmo-session-token');
    expect(setCookie).toContain('Max-Age=31536000');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Secure');
  });

  test('rejects a non-browser redirect before token exchange', async () => {
    const login = await app.request('https://kos.moe/login');
    const loginCookies = login.headers.get('set-cookie') ?? '';
    const state = getCookieValue(loginCookies, 'kosmo_oidc_state');
    const response = await app.request(
      `https://kos.moe/login/callback?code=oidc-code&state=${state}&redirect_uri=${encodeURIComponent(
        'kosmo://login/callback',
      )}`,
      { headers: { cookie: cookieHeader(loginCookies) } },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('OIDC callback redirect_uri is invalid');
    expect(fetch).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('native session exchange', () => {
  test('returns a Kosmo token without setting a cookie', async () => {
    const response = await app.request('/login/native/session', {
      body: JSON.stringify({
        code: 'native-code',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'kosmo://login/callback',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const tokenRequest = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<
      string,
      string
    >;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: 'kosmo-session-token' });
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(tokenRequest).toMatchObject({
      code: 'native-code',
      code_verifier: 'v'.repeat(43),
      redirect_uri: 'kosmo://login/callback',
    });
    expect(createSession).toHaveBeenCalledOnce();
  });

  test.each([
    {
      body: { code: '', codeVerifier: 'v'.repeat(43), redirectUri: 'kosmo://login/callback' },
      name: 'missing code',
    },
    {
      body: { code: 'code', codeVerifier: 'short', redirectUri: 'kosmo://login/callback' },
      name: 'short verifier',
    },
    {
      body: { code: 'code', codeVerifier: '!'.repeat(43), redirectUri: 'kosmo://login/callback' },
      name: 'invalid verifier characters',
    },
    {
      body: { code: 'code', codeVerifier: 'v'.repeat(43), redirectUri: 'https://evil.example' },
      name: 'invalid redirect',
    },
  ])('rejects $name without calling OIDC', async ({ body }) => {
    const response = await app.request('/login/native/session', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  test('does not create a session when OIDC rejects the code', async () => {
    fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
    );
    vi.stubGlobal('fetch', fetch);
    const response = await app.request('/login/native/session', {
      body: JSON.stringify({
        code: 'bad-code',
        codeVerifier: 'v'.repeat(43),
        redirectUri: 'kosmo://login/callback',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('OIDC code exchange failed');
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('GraphQL proxy', () => {
  test.each([
    {
      expectedAuthorization: 'Bearer cookie-token',
      headers: { cookie: 'kosmo_session=cookie-token' },
      name: 'cookie session',
    },
    {
      expectedAuthorization: 'Bearer native-token',
      headers: {
        authorization: 'Bearer native-token',
        cookie: 'kosmo_session=cookie-token',
      },
      name: 'explicit bearer session',
    },
    {
      expectedAuthorization: undefined,
      headers: {},
      name: 'anonymous request',
    },
  ])('forwards a $name', async ({ expectedAuthorization, headers: requestHeaders }) => {
    let body = '';
    fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      body = await new Response(init?.body).text();
      return new Response('upstream-body', {
        headers: { 'content-type': 'application/graphql-response+json', 'x-upstream': 'yes' },
        status: 202,
      });
    });
    vi.stubGlobal('fetch', fetch);
    const headers = new Headers({
      accept: 'application/graphql-response+json',
      'content-type': 'application/json',
    });
    for (const [name, value] of Object.entries(requestHeaders)) {
      if (value) {
        headers.set(name, value);
      }
    }
    const response = await app.request('/graphql', {
      body: '{"query":"{ __typename }"}',
      headers,
      method: 'POST',
    });
    const [input, init] = fetch.mock.calls[0] ?? [];
    const forwardedHeaders = new Headers(init?.headers);

    expect(String(input)).toBe('https://api.example/graphql');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    expect(forwardedHeaders.get('content-type')).toBe('application/json');
    expect(forwardedHeaders.get('accept')).toBe('application/graphql-response+json');
    expect(forwardedHeaders.get('authorization') ?? undefined).toBe(expectedAuthorization);
    expect(body).toBe('{"query":"{ __typename }"}');
    expect(response.status).toBe(202);
    expect(response.headers.get('x-upstream')).toBe('yes');
    expect(await response.text()).toBe('upstream-body');
  });

  test('rejects unsupported methods without calling the API', async () => {
    const response = await app.request('/graphql');

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('rejects malformed authorization instead of falling back to a cookie', async () => {
    const response = await app.request('/graphql', {
      body: '{}',
      headers: {
        authorization: 'Basic invalid',
        cookie: 'kosmo_session=cookie-token',
      },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Authorization header must use Bearer');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('runtime routing', () => {
  test('serves health, assets, and SPA deep links', async () => {
    const health = await app.request('/health');
    const asset = await app.request('/asset.js');
    const root = await app.request('/', { headers: { accept: '*/*' } });
    const deepLink = await app.request('/@alice/post-id', {
      headers: { accept: 'text/html' },
    });

    expect(health.status).toBe(200);
    expect(await health.text()).toBe('ok');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');
    expect(await asset.text()).toBe('console.log("asset")');
    expect(root.status).toBe(200);
    expect(await root.text()).toBe('<html>expo app</html>');
    expect(deepLink.status).toBe(200);
    expect(await deepLink.text()).toBe('<html>expo app</html>');
    expect(federationFetch).toHaveBeenCalledTimes(4);
  });

  test('keeps fallback headers mutable for federation response metadata', async () => {
    federationFetch.mockImplementation(async (request, options) => {
      if (!options.onNotFound) {
        throw new Error('Missing federation fallback');
      }

      const response = await options.onNotFound(request);
      response.headers.set('Vary', 'Accept');
      return response;
    });

    const response = await app.request('/health', {
      headers: { accept: 'application/activity+json' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('vary')).toBe('Accept');
  });

  test('does not turn a missing federation representation into the SPA', async () => {
    const response = await app.request('/users/missing', {
      headers: { accept: 'application/activity+json' },
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('404 Not Found');
  });

  test.each([undefined, '*/*'])(
    'preserves a missing WebFinger response with Accept %s',
    async (accept) => {
      const headers = accept ? { accept } : undefined;
      const response = await app.request('/.well-known/webfinger?resource=acct:missing@kos.moe', {
        headers,
      });

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('404 Not Found');
    },
  );

  test('lets federation handle any path before BFF and SPA routes', async () => {
    federationFetch.mockImplementation(
      async (request: Request) => new Response(new URL(request.url).pathname, { status: 203 }),
    );

    for (const path of ['/health', '/users/alice/inbox']) {
      const response = await app.request(path);

      expect(response.status).toBe(203);
      expect(await response.text()).toBe(new URL(path, 'http://localhost').pathname);
    }
    expect(federationFetch).toHaveBeenCalledTimes(2);
  });

  test('falls through when federation declines the requested representation', async () => {
    federationFetch.mockImplementation(async (request, options) => {
      if (!options.onNotAcceptable) {
        throw new Error('Missing federation representation fallback');
      }

      return options.onNotAcceptable(request);
    });

    const response = await app.request('/@alice/post-id', {
      headers: { accept: 'text/html' },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>expo app</html>');
  });

  test('preserves a federation 406 when no BFF route accepts the request', async () => {
    federationFetch.mockImplementation(async (request, options) => {
      if (!options.onNotAcceptable) {
        throw new Error('Missing federation representation fallback');
      }

      return options.onNotAcceptable(request);
    });

    const response = await app.request('/users/alice/inbox', { method: 'DELETE' });

    expect(response.status).toBe(406);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(await response.text()).toBe('Not acceptable');
  });
});

const getCookieValue = (setCookie: string, name: string) => {
  const value = new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`).exec(setCookie)?.[1];

  if (!value) {
    throw new Error(`Missing ${name} cookie`);
  }

  return value;
};

const cookieHeader = (setCookie: string) =>
  ['kosmo_oidc_state', 'kosmo_oidc_code_verifier']
    .map((name) => `${name}=${getCookieValue(setCookie, name)}`)
    .join('; ');

const createIdToken = () => {
  const payload = Buffer.from(JSON.stringify({ name: 'Kosmo User', sub: 'oidc-subject' })).toString(
    'base64url',
  );

  return `header.${payload}.signature`;
};
