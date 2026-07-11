import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Configuration, enableNonRepudiationChecks, ResponseBodyError } from 'openid-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { federation } from '@kosmo/fedify';
import type { Hono } from 'hono';
import type {
  authorizationCodeGrant as oidcAuthorizationCodeGrant,
  discovery as oidcDiscovery,
} from 'openid-client';

const { authorizationCodeGrant, createSession, discovery, federationFetch } = vi.hoisted(() => ({
  authorizationCodeGrant: vi.fn<typeof oidcAuthorizationCodeGrant>(),
  createSession:
    vi.fn<
      (identity: {
        accessToken: string;
        displayName: string;
        oidcSubject: string;
      }) => Promise<string>
    >(),
  discovery: vi.fn<typeof oidcDiscovery>(),
  federationFetch: vi.fn<typeof federation.fetch>(),
}));

vi.mock('openid-client', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  authorizationCodeGrant,
  discovery,
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
  vi.stubEnv('PUBLIC_OIDC_ISSUER', 'https://id.example');
  vi.stubEnv('PUBLIC_OIDC_CLIENT_ID', 'kosmo-client');
  vi.stubEnv('OIDC_CLIENT_SECRET', 'kosmo-secret');
  vi.stubEnv('PUBLIC_API_ORIGIN', 'https://api.example');
  vi.stubEnv('PUBLIC_ORIGIN', undefined);
  discovery.mockImplementation(
    async (_issuer, clientId, metadata) =>
      new Configuration(
        {
          authorization_endpoint: 'https://id.example/oauth/authorize',
          issuer: 'https://id.example',
          jwks_uri: 'https://id.example/oauth/jwks',
          token_endpoint: 'https://id.example/oauth/token',
        },
        clientId,
        metadata,
      ),
  );
  authorizationCodeGrant.mockImplementation(
    async () =>
      ({
        access_token: 'oidc-access-token',
        claims: () => ({ name: 'Kosmo User', sub: 'oidc-subject' }),
        expiresIn: () => undefined,
        id_token: 'signed-id-token',
        token_type: 'bearer' as const,
      }) as unknown as Awaited<ReturnType<typeof oidcAuthorizationCodeGrant>>,
  );
  createSession.mockResolvedValue('kosmo-session-token');
  federationFetch.mockImplementation(async (request, options) => {
    if (!options.onNotFound) {
      throw new Error('Missing federation fallback');
    }

    return options.onNotFound(request);
  });
  fetch = vi.fn<typeof globalThis.fetch>();
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
      headers: { 'sec-fetch-mode': 'navigate', 'User-Agent': 'KosmoApp/0.0.1' },
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
    expect(discovery).toHaveBeenCalledWith(
      new URL('https://id.example'),
      'kosmo-client',
      'kosmo-secret',
      undefined,
      { execute: [enableNonRepudiationChecks] },
    );
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
    const [, callbackUrl, checks] = authorizationCodeGrant.mock.calls[0] ?? [];

    expect(loginLocation.searchParams.get('redirect_uri')).toBe('https://kos.moe/login/callback');
    expect(loginCookies).toContain('Secure');
    expect(callbackUrl).toBeInstanceOf(URL);
    expect((callbackUrl as URL).origin + (callbackUrl as URL).pathname).toBe(
      'https://kos.moe/login/callback',
    );
    expect(checks).toMatchObject({ expectedState: state });
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
    const [, callbackUrl, checks] = authorizationCodeGrant.mock.calls[0] ?? [];
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(authorizationCodeGrant).toHaveBeenCalledOnce();
    expect((callbackUrl as URL).searchParams.get('code')).toBe('oidc-code');
    expect(checks).toEqual({
      expectedState: state,
      idTokenExpected: true,
      pkceCodeVerifier: verifier,
    });
    expect(createSession).toHaveBeenCalledWith({
      accessToken: 'oidc-access-token',
      displayName: 'Kosmo User',
      oidcSubject: 'oidc-subject',
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
    expect(authorizationCodeGrant).not.toHaveBeenCalled();
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
    const [, callbackUrl, checks] = authorizationCodeGrant.mock.calls[0] ?? [];

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: 'kosmo-session-token' });
    expect(response.headers.has('set-cookie')).toBe(false);
    expect((callbackUrl as URL).toString()).toBe('kosmo://login/callback?code=native-code');
    expect(checks).toEqual({
      expectedState: undefined,
      idTokenExpected: true,
      pkceCodeVerifier: 'v'.repeat(43),
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
    expect(authorizationCodeGrant).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  test.each([
    { error: 'invalid_grant', expectedStatus: 400, upstreamStatus: 400 },
    { error: 'server_error', expectedStatus: 503, upstreamStatus: 503 },
  ])(
    'returns $expectedStatus when OIDC responds with $upstreamStatus',
    async ({ error, expectedStatus, upstreamStatus }) => {
      const upstream = Response.json({ error }, { status: upstreamStatus });
      authorizationCodeGrant.mockRejectedValue(
        new ResponseBodyError(error, { cause: { error }, response: upstream }),
      );
      const response = await app.request('/login/native/session', {
        body: JSON.stringify({
          code: 'bad-code',
          codeVerifier: 'v'.repeat(43),
          redirectUri: 'kosmo://login/callback',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(expectedStatus);
      expect(await response.text()).toBe('OIDC code exchange failed');
      expect(createSession).not.toHaveBeenCalled();
    },
  );
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
    const response = await app.request('/graphql', {
      headers: { 'sec-fetch-mode': 'navigate' },
    });

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
    const health = await app.request('/health', {
      headers: { 'sec-fetch-mode': 'navigate' },
    });
    const asset = await app.request('/asset.js');
    const root = await app.request('/', { headers: { accept: '*/*' } });
    const deepLink = await app.request('/@alice/post-id', {
      headers: { 'sec-fetch-mode': 'navigate' },
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

    for (const path of ['/health', '/login', '/graphql', '/asset.js', '/users/alice/inbox']) {
      const response = await app.request(path);

      expect(response.status).toBe(203);
      expect(await response.text()).toBe(new URL(path, 'http://localhost').pathname);
    }
    expect(federationFetch).toHaveBeenCalledTimes(5);
  });

  test('falls through when federation declines the requested representation', async () => {
    federationFetch.mockImplementation(async (request, options) => {
      if (!options.onNotAcceptable) {
        throw new Error('Missing federation representation fallback');
      }

      return options.onNotAcceptable(request);
    });

    const response = await app.request('/@alice/post-id', {
      headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' },
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
