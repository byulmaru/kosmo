import { createHash, randomUUID } from 'node:crypto';
import { Accounts, db, Sessions } from '@kosmo/core/db';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation } from './graphql';
import type { APIRequestContext } from '@playwright/test';

const loginCodeVerifierCookie = 'kosmo_oidc_code_verifier';
const loginStateCookie = 'kosmo_oidc_state';
const apiOrigin = process.env.PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3001';
const oidcOrigin = process.env.PUBLIC_OIDC_ISSUER ?? 'http://127.0.0.1:4300';
const nativeOidcClientId = process.env.PUBLIC_OIDC_NATIVE_CLIENT_ID ?? 'kosmo-e2e-native-client';
const nativeSessionEndpoint = new URL('/graphql', apiOrigin).toString();
const nativeSessionOperationName = 'E2ENativeOidcSessionExchange';
const nativeSessionMutation = `
  mutation E2ENativeOidcSessionExchange($input: ExchangeNativeOidcSessionInput!) {
    exchangeNativeOidcSession(input: $input) {
      token
    }
  }
`;
const protectedHeadingRoutes = [
  { heading: '홈', path: '/home' },
  { heading: '글쓰기', path: '/compose' },
  { heading: '알림', path: '/notifications' },
  { heading: '피드백 보내기', path: '/feedback' },
] as const;

type NativeSessionGraphQLResponse = {
  data?: {
    exchangeNativeOidcSession?: {
      token?: unknown;
    } | null;
  } | null;
  errors?: {
    extensions?: { code?: unknown };
    message?: unknown;
  }[];
};

async function exchangeNativeOidcSession(
  request: APIRequestContext,
  input: Record<string, unknown>,
) {
  return request.post(nativeSessionEndpoint, {
    data: {
      operationName: nativeSessionOperationName,
      query: nativeSessionMutation,
      variables: { input },
    },
  });
}

function expectNativeSessionGraphQLError(body: NativeSessionGraphQLResponse) {
  expect(body.errors, JSON.stringify(body)).toBeDefined();
  expect(body.errors?.length ?? 0).toBeGreaterThan(0);
}
const invalidSessionCases = [
  {
    name: '존재하지 않는 세션 토큰',
    token: async () => 'missing-e2e-session-token',
  },
  {
    name: 'REVOKED 세션',
    token: async () => (await createE2ESession({ sessionState: SessionState.REVOKED })).token,
  },
  {
    name: 'EXPIRED 세션',
    token: async () => (await createE2ESession({ sessionState: SessionState.EXPIRED })).token,
  },
  {
    name: '비활성 계정 세션',
    token: async () => (await createE2ESession({ accountState: AccountState.DISABLED })).token,
  },
] as const;

async function getOIDCTokenRequestCount(request: APIRequestContext) {
  const response = await request.get(`${oidcOrigin}/__e2e/token-requests`);

  expect(response.ok()).toBe(true);

  const body = (await response.json()) as { count: number };

  return body.count;
}

async function authorizeNativeCode(
  request: APIRequestContext,
  codeVerifier: string,
  { clientId = nativeOidcClientId, loginHint }: { clientId?: string; loginHint?: string } = {},
) {
  const state = randomUUID();
  const authorizeUrl = new URL('/oauth/authorize', oidcOrigin);
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
    code_challenge_method: 'S256',
    redirect_uri: 'kosmo://login/callback',
    response_type: 'code',
    scope: 'openid profile',
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();

  const authorization = await request.get(authorizeUrl.toString(), { maxRedirects: 0 });
  const callbackUrl = new URL(authorization.headers().location ?? '');

  expect(authorization.status()).toBe(302);
  expect(callbackUrl.searchParams.get('state')).toBe(state);

  return callbackUrl;
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('비로그인 사용자는 루트 온보딩에서 로그인 진입점을 본다', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: '동인 창작 문화 향유자를 위한 차세대 연합우주 SNS' }),
  ).toBeVisible();
  await expect(
    page.getByText('KOSMO는 현재 오픈 베타로 운영 중이에요.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('이용 중 오류가 발생하거나 기능과 화면이 변경될 수 있어요.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('별마루 계정으로 가입/로그인해요.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('가입할 때는 이메일만 수집하고, 이메일 인증으로 로그인해요.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '시작하기' })).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute(
    'href',
    '/privacy',
  );
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
});

for (const viewport of [
  { centered: false, height: 812, padding: 24, width: 375 },
  { centered: true, height: 900, padding: 128, width: 1024 },
  { centered: true, height: 900, padding: 256, width: 1440 },
]) {
  test(`Welcome logo와 Hero가 ${viewport.width}px viewport에서 정렬된다`, async ({ page }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await page.goto('/');

    const logo = page.getByLabel('KOSMO 로고', { exact: true });
    const heading = page.getByRole('heading', {
      name: '동인 창작 문화 향유자를 위한 차세대 연합우주 SNS',
    });

    await expect(logo).toBeVisible();
    await expect
      .poll(async () => {
        const box = await logo.boundingBox();
        return box
          ? {
              height: Math.round(box.height),
              width: Math.round(box.width),
              x: Math.round(box.x),
            }
          : null;
      })
      .toEqual({ height: 101, width: 160, x: viewport.padding });
    await expect(heading).toBeVisible();
    await expect
      .poll(async () => {
        const box = await heading.boundingBox();
        return box ? Math.round(box.x) : null;
      })
      .toBe(viewport.padding);

    const [logoBox, headingBox] = await Promise.all([logo.boundingBox(), heading.boundingBox()]);
    expect(logoBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(headingBox!.y).toBeGreaterThan(logoBox!.y + logoBox!.height);

    if (viewport.centered) {
      const privacyBox = await page.getByRole('link', { name: '개인정보 처리방침' }).boundingBox();
      expect(privacyBox).not.toBeNull();

      const contentCenter = (logoBox!.y + privacyBox!.y + privacyBox!.height) / 2;
      expect(Math.abs(contentCenter - viewport.height / 2)).toBeLessThanOrEqual(2);
    } else {
      expect(Math.round(logoBox!.y)).toBe(44);
      await expect
        .poll(() => heading.evaluate((element) => getComputedStyle(element).wordBreak))
        .toBe('keep-all');
    }
  });
}

test('개인정보 처리방침은 로그인 없이 공개되고 landing으로 돌아갈 수 있다', async ({ page }) => {
  await page.goto('/privacy');

  await expect(page.getByRole('heading', { name: 'Kosmo 개인정보 처리방침' })).toBeVisible();
  await expect(page.getByText('시행일: 별도 공지')).toBeVisible();
  await expect(page.getByText('9. 자동 수집 정보와 행태정보')).toBeVisible();
  await expect(page.getByText(/Session replay: 세션의 10%/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'KOSMO로 돌아가기' })).toHaveAttribute('href', '/');
});

test('로그인 후 full shell에서도 개인정보 처리방침으로 이동한다', async ({ context, page }) => {
  const session = await createE2ESession();
  await setE2ESessionCookie(context, session.token);
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/home');

  const privacyLink = page.getByRole('link', { name: '개인정보 처리방침' });
  await expect(privacyLink).toHaveAttribute('href', '/privacy');
  await privacyLink.click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test('세션 확인이 실패해도 루트 온보딩과 로그인 진입점을 유지한다', async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    if (isGraphQLOperation(route.request().postData(), 'SessionProviderQuery')) {
      await route.fulfill({
        body: JSON.stringify({ errors: [{ message: 'temporary session failure' }] }),
        contentType: 'application/json',
        status: 503,
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: '동인 창작 문화 향유자를 위한 차세대 연합우주 SNS' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '시작하기' })).toHaveAttribute('href', '/login');
});

test('mock OIDC로 로그인하면 보호 홈으로 이동하고 세션이 유지된다', async ({ page }) => {
  await page.route('**/graphql', async (route) => {
    if (isGraphQLOperation(route.request().postData(), 'UniversalShellQuery')) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await route.continue();
  });
  await page.addInitScript(() => {
    const storageKey = 'kosmo-e2e-history-paths';
    const record = (method: string) => {
      const entries = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as string[];
      entries.push(`${method}:${location.pathname}${location.search}`);
      sessionStorage.setItem(storageKey, JSON.stringify(entries));
    };

    record('document');

    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        record(method);
        return result;
      };
    }
  });

  await page.goto('/');
  await page.getByRole('link', { name: '시작하기' }).click();

  await expect(page).toHaveURL(/\/home$/);
  const historyPaths = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('kosmo-e2e-history-paths') ?? '[]'),
  );
  expect(historyPaths).not.toContain('pushState:/undefined/undefined');
  expect(historyPaths).not.toContain('replaceState:/undefined/undefined');
  expect(historyPaths).not.toContain('document:/undefined/undefined');
  await expect(page.getByRole('heading', { name: '프로필을 만들어 시작하세요' })).toBeVisible();
  await page.getByRole('button', { name: '프로필 만들기' }).click();
  await expect(page.getByLabel('프로필 전환')).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
});

test('Deleted Account의 Web OIDC callback은 Session 없이 일반 오류로 거부된다', async ({
  context,
  page,
}) => {
  await db.insert(Accounts).values({
    displayName: 'Deleted E2E User',
    oidcSubject: 'oidc-mock-e2e-user',
    state: AccountState.DISABLED,
  });

  const response = await page.goto('/login');

  expect(response?.status()).toBe(500);
  expect(await response?.text()).toBe('Internal Server Error');
  expect(await db.select().from(Sessions)).toEqual([]);
  expect((await context.cookies()).some(({ name }) => name === 'kosmo_session')).toBe(false);
  expect(await page.textContent('body')).not.toContain('oidc-mock-e2e-user');
});

test('API는 public native PKCE code를 cookie 없이 Kosmo 세션으로 교환한다', async ({ request }) => {
  const codeVerifier = 'v'.repeat(43);
  const callbackUrl = await authorizeNativeCode(request, codeVerifier);
  const response = await exchangeNativeOidcSession(request, {
    code: callbackUrl.searchParams.get('code'),
    codeVerifier,
    redirectUri: 'kosmo://login/callback',
  });
  const body = (await response.json()) as NativeSessionGraphQLResponse;

  expect(response.status()).toBe(200);
  expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();

  const token = body.data?.exchangeNativeOidcSession?.token;

  expect(typeof token).toBe('string');

  if (typeof token !== 'string') {
    throw new Error('Native session response did not contain a token.');
  }

  const session = await db
    .select({ oidcSessionKey: Sessions.oidcSessionKey })
    .from(Sessions)
    .where(eq(Sessions.token, token))
    .then((sessions) => sessions[0]);

  expect(session).toBeDefined();
  expect(session?.oidcSessionKey).toBeNull();
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers().pragma).toBe('no-cache');
  expect(response.headers()['set-cookie']).toBeUndefined();
});

test('Suspended Account의 Native exchange는 Session 없이 일반 권한 오류로 거부된다', async ({
  request,
}) => {
  await db.insert(Accounts).values({
    displayName: 'Suspended E2E User',
    oidcSubject: 'oidc-mock-e2e-user',
    state: AccountState.SUSPENDED,
  });
  const codeVerifier = 'v'.repeat(43);
  const callbackUrl = await authorizeNativeCode(request, codeVerifier);
  const response = await exchangeNativeOidcSession(request, {
    code: callbackUrl.searchParams.get('code'),
    codeVerifier,
    redirectUri: 'kosmo://login/callback',
  });
  const body = (await response.json()) as NativeSessionGraphQLResponse;

  expect(response.status()).toBe(200);
  expect(body.data).toBeNull();
  expect(body.errors?.[0]?.extensions?.code).toBe('PERMISSION_DENIED');
  expect(body.errors?.[0]?.message).toBe('Permission denied');
  expect(JSON.stringify(body)).not.toContain('oidc-mock-e2e-user');
  expect(JSON.stringify(body)).not.toContain(codeVerifier);
  expect(await db.select().from(Sessions)).toEqual([]);
  expect(response.headers()['set-cookie']).toBeUndefined();
});

test('API는 서명이 잘못된 public native ID token을 Kosmo 세션으로 교환하지 않는다', async ({
  request,
}) => {
  const codeVerifier = 'v'.repeat(43);
  const callbackUrl = await authorizeNativeCode(request, codeVerifier, {
    loginHint: 'invalid-signature',
  });
  const code = callbackUrl.searchParams.get('code');

  if (!code) {
    throw new Error('OIDC mock did not return an authorization code.');
  }

  const response = await exchangeNativeOidcSession(request, {
    code,
    codeVerifier,
    redirectUri: 'kosmo://login/callback',
  });
  const body = (await response.json()) as NativeSessionGraphQLResponse;

  expect(response.status()).toBe(200);
  expectNativeSessionGraphQLError(body);
  expect(JSON.stringify(body)).not.toContain(code);
  expect(JSON.stringify(body)).not.toContain(codeVerifier);
});

test('API는 OIDC token endpoint의 5xx를 내부 오류로 분류한다', async ({ request }) => {
  const codeVerifier = 'v'.repeat(43);
  const callbackUrl = await authorizeNativeCode(request, codeVerifier, {
    loginHint: 'token-server-error',
  });
  const response = await exchangeNativeOidcSession(request, {
    code: callbackUrl.searchParams.get('code'),
    codeVerifier,
    redirectUri: 'kosmo://login/callback',
  });
  const body = (await response.json()) as NativeSessionGraphQLResponse;

  expect(response.status()).toBe(200);
  expectNativeSessionGraphQLError(body);
  expect(body.errors?.[0]?.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
});

test('API는 잘못된 PKCE verifier를 OIDC token endpoint에 보내지 않는다', async ({ request }) => {
  const tokenRequestCount = await getOIDCTokenRequestCount(request);
  const response = await exchangeNativeOidcSession(request, {
    code: 'e2e-unsubmitted-code',
    codeVerifier: 'too-short',
    redirectUri: 'kosmo://login/callback',
  });
  const body = (await response.json()) as NativeSessionGraphQLResponse;

  expect(response.status()).toBe(200);
  expectNativeSessionGraphQLError(body);
  expect(await getOIDCTokenRequestCount(request)).toBe(tokenRequestCount);
});

test('API는 raw upstream token field를 세션 교환 입력으로 허용하지 않는다', async ({ request }) => {
  const tokenRequestCount = await getOIDCTokenRequestCount(request);
  const response = await exchangeNativeOidcSession(request, {
    accessToken: 'e2e-upstream-access-token',
    code: 'e2e-unsubmitted-code',
    codeVerifier: 'v'.repeat(43),
    idToken: 'e2e.upstream.id.token',
    redirectUri: 'kosmo://login/callback',
  });
  const body = (await response.json()) as NativeSessionGraphQLResponse;

  expect(response.status()).toBe(400);
  expectNativeSessionGraphQLError(body);
  expect(await getOIDCTokenRequestCount(request)).toBe(tokenRequestCount);
});

test('DB reset 후에도 API에 캐시된 local instance로 프로필을 만들 수 있다', async ({
  context,
  page,
}) => {
  const handle = `e2e_created_${randomUUID().slice(0, 8)}`;
  const { token } = await createE2ESession({ profile: false });

  await setE2ESessionCookie(context, token);
  await page.goto('/home');
  await expect(page).toHaveURL(/\/home$/);

  const response = await page.evaluate(async (profileHandle) => {
    const graphqlResponse = await fetch('/graphql', {
      body: JSON.stringify({
        query: `
          mutation E2ECreateProfile($handle: String!) {
            createProfile(input: { handle: $handle }) {
              profile {
                handle
              }
            }
          }
        `,
        operationName: 'E2ECreateProfile',
        variables: { handle: profileHandle },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    return graphqlResponse.json();
  }, handle);

  expect(response.errors, JSON.stringify(response.errors)).toBeUndefined();
  expect(response.data.createProfile.profile.handle).toBe(handle);
});

test('비로그인 보호 라우트 진입은 스플래시 후 루트로 이동한다', async ({ page }) => {
  let releaseProtectedLayoutQuery: (() => void) | null = null;
  let resolveProtectedLayoutPaused!: () => void;
  const protectedLayoutPaused = new Promise<void>((resolve) => {
    resolveProtectedLayoutPaused = resolve;
  });

  await page.route('**/graphql', async (route) => {
    if (
      !releaseProtectedLayoutQuery &&
      isGraphQLOperation(route.request().postData(), 'SessionProviderQuery')
    ) {
      await new Promise<void>((resolve) => {
        releaseProtectedLayoutQuery = resolve;
        resolveProtectedLayoutPaused();
      });
    }

    await route.continue();
  });

  const navigation = page.goto('/home');

  await protectedLayoutPaused;
  await expect(page.getByRole('progressbar', { name: '세션을 확인하는 중입니다.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);

  releaseProtectedLayoutQuery?.();
  await navigation;

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
});

for (const scenario of invalidSessionCases) {
  test(`${scenario.name}으로 보호 라우트에 진입하면 루트로 이동한다`, async ({ context, page }) => {
    await setE2ESessionCookie(context, await scenario.token());
    await page.goto('/home');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
  });
}

test('OIDC callback은 허용되지 않은 redirect_uri를 거부한다', async ({
  baseURL,
  context,
  page,
  request,
}) => {
  const state = 'e2e-invalid-redirect-state';
  const callbackUrl = new URL('/login/callback', baseURL);

  const tokenRequestCount = await getOIDCTokenRequestCount(request);

  await context.addCookies([
    {
      domain: callbackUrl.hostname,
      httpOnly: true,
      name: loginStateCookie,
      path: '/login/callback',
      sameSite: 'Lax',
      secure: callbackUrl.protocol === 'https:',
      value: state,
    },
    {
      domain: callbackUrl.hostname,
      httpOnly: true,
      name: loginCodeVerifierCookie,
      path: '/login/callback',
      sameSite: 'Lax',
      secure: callbackUrl.protocol === 'https:',
      value: 'e2e-code-verifier',
    },
  ]);

  const response = await page.goto(
    `/login/callback?code=e2e-code&state=${state}&redirect_uri=${encodeURIComponent(
      'https://evil.example/callback',
    )}`,
  );

  expect(response?.status()).toBe(400);
  expect(await getOIDCTokenRequestCount(request)).toBe(tokenRequestCount);
});

test.describe('로그인 사용자 보호 라우트', () => {
  test.beforeEach(async ({ context }) => {
    const { token } = await createE2ESession();

    await setE2ESessionCookie(context, token);
  });

  test('Settings route-owned back은 direct/fresh detail을 root로 replace하고 forward에서 detail을 복원하지 않는다', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 768 });

    await page.goto('/home');
    await expect(page).toHaveURL(/\/home$/);

    await page.goto('/settings/default-post-visibility');
    await expect(page).toHaveURL(/\/settings\/default-post-visibility$/);
    await expect(page.getByRole('heading', { name: '게시물 기본 공개 범위' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '설정으로 돌아가기' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '설정 목록' })).toHaveCount(0);

    await page.getByRole('button', { name: '설정으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '게시물 기본 공개 범위' })).toHaveCount(0);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '게시물 기본 공개 범위' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup')).toHaveCount(0);

    await page.getByRole('link', { name: '게시물 기본 공개 범위 설정 열기' }).click();
    await expect(page).toHaveURL(/\/settings\/default-post-visibility$/);
    await expect(page.getByRole('heading', { name: '게시물 기본 공개 범위' })).toHaveCount(1);

    await page.getByRole('button', { name: '설정으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '게시물 기본 공개 범위' })).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '게시물 기본 공개 범위' })).toHaveCount(0);
    await expect(page.getByText('앱을 불러오지 못했어요 잠시 후 다시 시도해주세요.')).toHaveCount(
      0,
    );
  });

  for (const route of protectedHeadingRoutes) {
    test(`${route.path}에서 보호 shell과 페이지 heading을 본다`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveURL(new RegExp(`${route.path}$`));
      await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
      await expect(page.getByText(route.heading, { exact: true }).last()).toBeVisible();
      await expect(page.getByRole('progressbar')).toHaveCount(0);
    });
  }

  test('/search에서 보호 shell과 검색 입력을 본다', async ({ page }) => {
    await page.goto('/search');

    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '검색어' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });

  test('web shell은 document scroll을 유지한다', async ({ page }) => {
    await page.setViewportSize({ height: 360, width: 1440 });
    await page.goto('/compose');

    await expect(page.getByRole('textbox', { name: '게시글 본문' }).first()).toBeVisible();

    const scrollState = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      overflowY: getComputedStyle(document.body).overflowY,
      scrollHeight: document.documentElement.scrollHeight,
    }));

    expect(scrollState.overflowY).toBe('auto');
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);

    await page.mouse.move(720, 180);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('mobile 주요 route는 메뉴와 제목을 하나의 64px header에 둔다', async ({ page }) => {
    await page.setViewportSize({ height: 667, width: 390 });

    for (const route of [
      { heading: '글쓰기', path: '/compose' },
      { heading: '알림', path: '/notifications' },
    ]) {
      await page.goto(route.path);

      const heading = page.getByRole('heading', { name: route.heading });
      const header = heading.locator('..');
      const menuButton = header.getByRole('button', { name: '메뉴 열기' });

      await expect(heading).toHaveCount(1);
      await expect(menuButton).toBeVisible();
      await expect.poll(async () => (await header.boundingBox())?.height).toBe(64);
      await expect
        .poll(async () => {
          const [buttonBox, headerBox] = await Promise.all([
            menuButton.boundingBox(),
            header.boundingBox(),
          ]);

          return buttonBox && headerBox
            ? Math.abs(buttonBox.y + buttonBox.height / 2 - (headerBox.y + headerBox.height / 2))
            : Number.POSITIVE_INFINITY;
        })
        .toBeLessThanOrEqual(1);
    }
  });

  test('mobile drawer는 왼쪽에 열리고 Lucide 메뉴 규격을 유지한다', async ({ page }) => {
    let canonicalProfilePath = '';

    await page.route('**/graphql', async (route) => {
      const requestBody = route.request().postData();
      if (
        !isGraphQLOperation(requestBody, 'UniversalShellQuery') &&
        !isGraphQLOperation(requestBody, 'HomePageQuery')
      ) {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      const body = (await response.json()) as {
        data?: {
          currentSession?: {
            selectedProfile?: { handle: string; id: string; relativeHandle: string } | null;
          } | null;
          me?: {
            profiles?: Array<{ id: string; relativeHandle: string } | null> | null;
          } | null;
        };
      };
      const selectedProfile = body.data?.currentSession?.selectedProfile;

      if (selectedProfile) {
        selectedProfile.relativeHandle = `@${selectedProfile.handle}@remote.example`;
        for (const profile of body.data?.me?.profiles ?? []) {
          if (profile?.id === selectedProfile.id) {
            profile.relativeHandle = selectedProfile.relativeHandle;
          }
        }
        canonicalProfilePath = `/${selectedProfile.relativeHandle}`;
      }

      await route.fulfill({
        body: JSON.stringify(body),
        contentType: 'application/json',
        status: response.status(),
      });
    });

    await page.setViewportSize({ height: 667, width: 390 });
    await page.goto('/home');
    const homeHeading = page.getByRole('heading', { name: '홈' });
    const menuButton = page.getByRole('button', { name: '메뉴 열기' });
    const homeHeader = homeHeading.locator('..').locator('..');
    const homeMark = homeHeader.locator('[aria-hidden="true"] img');

    await expect(homeHeading).toHaveCount(1);
    await expect(menuButton).toBeVisible();
    await expect
      .poll(async () => {
        const box = await menuButton.boundingBox();
        return box ? { height: box.height, width: box.width } : null;
      })
      .toEqual({ height: 44, width: 44 });
    await expect.poll(async () => (await homeHeader.boundingBox())?.height).toBe(64);
    await expect.poll(async () => (await homeMark.boundingBox())?.width).toBe(38);
    await expect
      .poll(async () => {
        const [headerBox, markBox] = await Promise.all([
          homeHeader.boundingBox(),
          homeMark.boundingBox(),
        ]);

        return headerBox && markBox
          ? Math.abs(markBox.x + markBox.width / 2 - (headerBox.x + headerBox.width / 2))
          : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(1);
    await menuButton.click();

    const drawer = page.locator('#mobile-sidebar');
    const navigation = drawer.getByRole('navigation', { name: '주요 메뉴' });
    const home = navigation.getByRole('link', { name: '홈' });
    const homeIcon = home.locator('svg');
    const homeLabel = home.getByText('홈', { exact: true });

    await expect(drawer).toBeVisible();
    await expect.poll(() => canonicalProfilePath).not.toBe('');
    await expect(navigation.getByRole('link', { exact: true, name: '프로필' })).toHaveAttribute(
      'href',
      canonicalProfilePath,
    );
    await expect(drawer.getByRole('link', { name: '글쓰기' })).toHaveCount(0);
    await expect(drawer.getByRole('link', { name: '개인정보 처리방침' })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: '피드백 보내기' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: /팔로잉/ })).toHaveAttribute(
      'href',
      `${canonicalProfilePath}/following`,
    );
    await expect(drawer.getByRole('link', { name: /^\S+ 팔로워$/ })).toHaveAttribute(
      'href',
      `${canonicalProfilePath}/followers`,
    );
    const profileLinks = await page.getByRole('link', { exact: true, name: '프로필' }).all();
    expect(profileLinks).toHaveLength(1);
    for (const profileLink of profileLinks) {
      await expect(profileLink).toHaveAttribute('href', canonicalProfilePath);
    }
    expect(await drawer.boundingBox()).toMatchObject({ height: 667, width: 320, x: 0, y: 0 });
    expect(await home.boundingBox()).toMatchObject({ height: 45, width: 264 });
    const iconBox = await homeIcon.boundingBox();
    const labelBox = await homeLabel.boundingBox();
    expect(iconBox).toMatchObject({ height: 20, width: 20 });
    expect(labelBox!.x).toBeGreaterThan(iconBox!.x + iconBox!.width);
    expect(
      Math.abs(labelBox!.y + labelBox!.height / 2 - (iconBox!.y + iconBox!.height / 2)),
    ).toBeLessThanOrEqual(1);

    await page.setViewportSize({ height: 480, width: 390 });

    const drawerState = await drawer.evaluate((element) => {
      let fixedAncestor: HTMLElement | null = element as HTMLElement;
      while (fixedAncestor && getComputedStyle(fixedAncestor).position !== 'fixed') {
        fixedAncestor = fixedAncestor.parentElement;
      }

      const menuScroll = [...element.querySelectorAll<HTMLElement>('*')].find((candidate) =>
        ['auto', 'scroll'].includes(getComputedStyle(candidate).overflowY),
      );
      const menuItems =
        element.querySelector('[role="navigation"][aria-label="주요 메뉴"]')?.children ?? [];

      return {
        animationName: fixedAncestor ? getComputedStyle(fixedAncestor).animationName : null,
        hasEmoji: /\p{Extended_Pictographic}/u.test(element.textContent ?? ''),
        itemsUseSvg: [...menuItems].every((item) => item.querySelector('svg')),
        scrollClientHeight: menuScroll?.clientHeight ?? 0,
        scrollHeight: menuScroll?.scrollHeight ?? 0,
      };
    });

    expect(drawerState.animationName).toBe('none');
    expect(drawerState.hasEmoji).toBe(false);
    expect(drawerState.itemsUseSvg).toBe(true);
    expect(drawerState.scrollHeight).toBeGreaterThan(drawerState.scrollClientHeight);
  });
});
