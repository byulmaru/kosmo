import { createHash, randomUUID } from 'node:crypto';
import { Accounts, db, firstOrThrow, Sessions } from '@kosmo/core/db';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import {
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation, toGlobalId } from './graphql';
import type { APIRequestContext } from '@playwright/test';

const loginCodeVerifierCookie = 'kosmo_oidc_code_verifier';
const loginStateCookie = 'kosmo_oidc_state';
const apiOrigin = process.env.INTERNAL_API_ORIGIN ?? 'http://127.0.0.1:3001';
const oidcOrigin = process.env.PUBLIC_OIDC_ISSUER ?? 'http://127.0.0.1:4300';
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
  { heading: '알림', path: '/notifications' },
  { heading: '피드백 보내기', path: '/feedback' },
] as const;
const publicPolicyRoutes = [
  { heading: 'Kosmo 개인정보 처리방침', path: '/privacy' },
  { heading: '개인정보처리방침 개정 안내', path: '/privacy/changes/2026-10-13' },
  { heading: 'Kosmo 계정 삭제 안내', path: '/account-deletion' },
  { heading: 'Kosmo 아동 안전 정책', path: '/child-safety' },
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
  { loginHint }: { loginHint?: string } = {},
) {
  const state = randomUUID();
  const authorizeUrl = new URL('/oauth/authorize', oidcOrigin);
  authorizeUrl.search = new URLSearchParams({
    client_id: process.env.PUBLIC_OIDC_CLIENT_ID ?? 'kosmo-e2e-client',
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

test('쿠키 없는 루트 직접 진입과 새로고침은 공개 Local 게시글을 유지한다', async ({
  context,
  page,
}) => {
  const author = await createE2EProfile({ handle: 'guest_root_author' });
  const body = 'E2E guest root public post';
  await createE2EPost({ body, profileId: author.id });
  await page.setViewportSize({ height: 900, width: 1440 });

  expect((await context.cookies()).some(({ name }) => name === 'kosmo_session')).toBe(false);
  await page.goto('/');

  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.getByRole('heading', { name: '타임라인 둘러보기', exact: true })).toBeVisible();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await expect(page.getByRole('tablist', { name: '타임라인' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '홈', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'KOSMO에서 계속하기' })).toHaveAttribute(
    'href',
    '/login',
  );

  await page.reload();

  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  expect((await context.cookies()).some(({ name }) => name === 'kosmo_session')).toBe(false);
});

for (const viewport of [
  { height: 844, layout: 'mobile', width: 390 },
  { height: 900, layout: 'compact', width: 1024 },
  { height: 900, layout: 'full', width: 1440 },
] as const) {
  test(`공개 루트·Profile·Post는 ${viewport.layout} 공용 로고와 가입·로그인 진입을 유지한다`, async ({
    page,
  }) => {
    const author = await createE2EProfile({ handle: 'guest_shell_author' });
    const post = await createE2EPost({ body: 'E2E guest shared shell post', profileId: author.id });
    const paths = [
      '/',
      '/@guest_shell_author',
      `/@guest_shell_author/${toGlobalId('Post', post.id)}`,
    ];
    await page.setViewportSize({ height: viewport.height, width: viewport.width });

    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByText('E2E guest shared shell post', { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: '가입 안내', exact: true })).toBeVisible();
      const bottomNavigation = page.getByRole('navigation', { name: '하단 탐색' });
      if (viewport.layout === 'mobile') {
        await expect(bottomNavigation).toBeVisible();
      } else {
        await expect(bottomNavigation).toHaveCount(0);
      }
      await expect(page.getByRole('tablist', { name: '타임라인' })).toHaveCount(0);

      const menu = page.getByRole('button', { name: '메뉴 열기' });
      if (viewport.layout === 'mobile') {
        await menu.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog', { name: '메뉴', exact: true })).toBeVisible();
      }

      const navigation = page.getByRole('navigation', { name: '주요 메뉴' });
      const signup = navigation.getByRole('link', { name: '가입하기', exact: true });
      const login = navigation.getByRole('link', { name: '로그인', exact: true });
      await expect(signup).toHaveAttribute('href', '/login');
      await expect(login).toHaveAttribute('href', '/login');
      await expect(navigation.getByRole('link', { name: /^(홈|검색|알림|프로필)$/ })).toHaveCount(
        0,
      );
      await expect(navigation.getByRole('button', { name: '설정 및 기타' })).toHaveCount(0);

      const logo = navigation.getByLabel('KOSMO 로고', { exact: true });
      await expect(logo).toBeVisible();
      await expect
        .poll(async () => {
          const box = await logo.boundingBox();
          return box ? { height: Math.round(box.height), width: Math.round(box.width) } : null;
        })
        .toEqual(
          viewport.layout === 'compact' ? { height: 48, width: 48 } : { height: 101, width: 160 },
        );
      await expect
        .poll(() =>
          logo.evaluate((element) => {
            const image =
              element instanceof HTMLImageElement ? element : element.querySelector('img');
            return image ? { height: image.naturalHeight, width: image.naturalWidth } : null;
          }),
        )
        .toEqual(
          viewport.layout === 'compact'
            ? { height: 1024, width: 1024 }
            : { height: 1050, width: 1665 },
        );
      const logoBox = await logo.boundingBox();
      const navigationBox = await navigation.boundingBox();
      const signupBox = await signup.boundingBox();
      expect(logoBox).not.toBeNull();
      expect(navigationBox).not.toBeNull();
      expect(signupBox).not.toBeNull();
      expect(logoBox!.x).toBeGreaterThanOrEqual(navigationBox!.x);
      expect(logoBox!.x + logoBox!.width).toBeLessThanOrEqual(
        navigationBox!.x + navigationBox!.width,
      );
      expect(logoBox!.y + logoBox!.height).toBeLessThanOrEqual(signupBox!.y);

      await signup.focus();
      await page.keyboard.press('Tab');
      await expect(login).toBeFocused();
      if (viewport.layout === 'mobile') {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: '메뉴', exact: true })).toHaveCount(0);
        await expect(menu).toBeFocused();
      }
    }
  });
}

test('하단 CTA 닫힘은 공개 링크 이동과 새로고침에서 유지되고 다른 탭과 분리된다', async ({
  context,
  page,
}) => {
  const author = await createE2EProfile({
    displayName: 'Guest Reader Author',
    handle: 'guest_reader_author',
  });
  const post = await createE2EPost({ body: 'E2E guest reading path', profileId: author.id });
  const postPath = `/@guest_reader_author/${toGlobalId('Post', post.id)}`;
  const postRow = page.getByRole('article').filter({
    has: page.getByText('E2E guest reading path', { exact: true }),
  });
  const invitation = page.getByRole('region', { name: '가입 안내', exact: true });
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/');
  await expect(page.getByText('E2E guest reading path', { exact: true })).toBeVisible();

  await invitation.getByRole('button', { name: '가입 안내 닫기' }).focus();
  await page.keyboard.press('Enter');
  await expect(invitation).toHaveCount(0);

  await postRow
    .locator('a[href="/@guest_reader_author"]')
    .filter({ hasText: 'Guest Reader Author' })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === '/@guest_reader_author');
  await expect(page.getByRole('link', { name: '가입하기', exact: true })).toBeVisible();
  await expect(invitation).toHaveCount(0);
  await postRow.locator(`a[href="${postPath}"]`).click();
  await expect(page).toHaveURL((url) => url.pathname === postPath);
  await expect(invitation).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('E2E guest reading path', { exact: true })).toBeVisible();
  await expect(invitation).toHaveCount(0);
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();

  const anotherTab = await context.newPage();
  try {
    await anotherTab.goto('/');
    await expect(anotherTab.getByRole('region', { name: '가입 안내', exact: true })).toBeVisible();
  } finally {
    await anotherTab.close();
  }
});

for (const route of publicPolicyRoutes) {
  test(`${route.path}는 로그인 없이 공개되고 문서 heading을 표시한다`, async ({ page }) => {
    await page.goto(route.path);

    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
  });
}

test('공개 정책 문서에서 공개 Local로 돌아갈 수 있다', async ({ page }) => {
  await page.goto('/privacy');

  await page.getByRole('link', { name: 'KOSMO로 돌아가기' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'KOSMO에서 계속하기' })).toBeVisible();
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

test('로그인 후 Settings 정보에서 공개 정책 문서로 이동한다', async ({ context, page }) => {
  const session = await createE2ESession();
  await setE2ESessionCookie(context, session.token);
  await page.setViewportSize({ height: 900, width: 1440 });

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();

  await page.getByRole('link', { name: '정보 설정 열기' }).click();
  await expect(page).toHaveURL(/\/settings\/info$/);
  await expect(page.getByRole('heading', { name: '정보' })).toBeVisible();

  await page.getByRole('link', { name: '개인정보 처리방침' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Kosmo 개인정보 처리방침' })).toBeVisible();
});

test('루트 세션 오류는 guest 안내 대신 오류를 표시하고 재시도로 공개 Local을 복구한다', async ({
  page,
}) => {
  const author = await createE2EProfile({ handle: 'guest_retry_author' });
  await createE2EPost({ body: 'E2E guest session retry post', profileId: author.id });
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

  await expect(page.getByRole('alert')).toContainText('로그인 상태를 확인하지 못했어요');
  await expect(page.getByRole('region', { name: '가입 안내', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);

  await page.unroute('**/graphql');
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();

  await expect(page.getByText('E2E guest session retry post', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '가입 안내', exact: true })).toBeVisible();
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
  await page.getByRole('link', { name: 'KOSMO에서 계속하기' }).click();

  await expect(page).toHaveURL(/\/first-profile\/handle$/);
  const historyPaths = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('kosmo-e2e-history-paths') ?? '[]'),
  );
  expect(historyPaths).not.toContain('pushState:/undefined/undefined');
  expect(historyPaths).not.toContain('replaceState:/undefined/undefined');
  expect(historyPaths).not.toContain('document:/undefined/undefined');
  await expect(page.getByRole('heading', { name: /나만의 핸들을\s*정해 주세요/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '핸들', exact: true })).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL(/\/first-profile\/handle$/);
});

for (const { entry, publicRoute } of [
  { entry: '가입하기', publicRoute: 'root' },
  { entry: '로그인', publicRoute: 'root' },
  { entry: 'KOSMO에서 계속하기', publicRoute: 'root' },
  { entry: '가입하기', publicRoute: 'profile' },
  { entry: 'KOSMO에서 계속하기', publicRoute: 'post' },
]) {
  for (const newTab of [false, true]) {
    test(`공개 ${publicRoute}의 ${entry}는 ${newTab ? '새 탭에서' : '현재 탭에서'} 바로 인증을 시작한다`, async ({
      context,
      page,
    }) => {
      const author = await createE2ESession({ handle: 'guest_entry_author' });
      const post = await createE2EPost({ body: 'guest entry', profileId: author.profile!.id });
      const publicPath =
        publicRoute === 'root'
          ? '/'
          : publicRoute === 'profile'
            ? '/@guest_entry_author'
            : `/@guest_entry_author/${toGlobalId('Post', post.id)}`;
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(publicPath);
      const entryLink = page.getByRole('link', { name: entry, exact: true });
      await expect(entryLink).toHaveAttribute('href', '/login');
      const loginRequest = context.waitForEvent('request', {
        predicate: (request) =>
          new URL(request.url()).pathname === '/login' && request.isNavigationRequest(),
      });
      const destination = newTab ? context.waitForEvent('page') : Promise.resolve(page);
      await entryLink.click({ button: newTab ? 'middle' : 'left' });
      const signupTab = await destination;
      try {
        await loginRequest;
        await expect(signupTab).toHaveURL(/\/first-profile\/handle$/);
        await expect(
          signupTab.getByRole('heading', { name: /나만의 핸들을\s*정해 주세요/ }),
        ).toBeVisible();
        if (newTab) {
          await expect(page).toHaveURL((url) => url.pathname === publicPath);
        }
      } finally {
        if (newTab) {
          await signupTab.close();
        }
      }
    });
  }
}

test('Deleted Account의 Web OIDC callback은 같은 Account에 새 Session을 만들고 Profile 생성으로 이동한다', async ({
  context,
  page,
}) => {
  const deletedAccount = await db
    .insert(Accounts)
    .values({
      displayName: 'Deleted E2E User',
      oidcSubject: 'oidc-mock-e2e-user',
      state: AccountState.DISABLED,
    })
    .returning({ id: Accounts.id })
    .then(firstOrThrow);

  const response = await page.goto('/login');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/first-profile\/handle$/);
  await expect(page.getByRole('heading', { name: /나만의 핸들을\s*정해 주세요/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '핸들', exact: true })).toBeVisible();

  const account = await db
    .select({ id: Accounts.id, state: Accounts.state })
    .from(Accounts)
    .where(eq(Accounts.oidcSubject, 'oidc-mock-e2e-user'))
    .then((accounts) => accounts[0]);
  const sessions = await db
    .select()
    .from(Sessions)
    .where(eq(Sessions.accountId, deletedAccount.id));

  expect(account).toEqual({ id: deletedAccount.id, state: AccountState.ACTIVE });
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.state).toBe(SessionState.ACTIVE);
  expect(sessions[0]?.activeProfileId).toBeNull();
  expect((await context.cookies()).some(({ name }) => name === 'kosmo_session')).toBe(true);
});

for (const initialAccountState of [undefined, AccountState.DISABLED] as const) {
  test(`API는 ${initialAccountState ?? '신규'} Account에 shared confidential PKCE code로 cookie 없이 Kosmo 세션을 발급한다`, async ({
    request,
  }) => {
    const existingAccount = initialAccountState
      ? await db
          .insert(Accounts)
          .values({
            displayName: 'Deleted Native E2E User',
            oidcSubject: 'oidc-mock-e2e-user',
            state: initialAccountState,
          })
          .returning({ id: Accounts.id })
          .then(firstOrThrow)
      : undefined;
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
      .select({
        accountId: Sessions.accountId,
        activeProfileId: Sessions.activeProfileId,
        oidcSessionKey: Sessions.oidcSessionKey,
      })
      .from(Sessions)
      .where(eq(Sessions.token, token))
      .then((sessions) => sessions[0]);

    expect(session).toBeDefined();

    if (!session) {
      throw new Error('Native session response did not persist a Session.');
    }

    const account = await db
      .select({ state: Accounts.state })
      .from(Accounts)
      .where(eq(Accounts.id, session.accountId))
      .then((accounts) => accounts[0]);

    expect(account?.state).toBe(AccountState.ACTIVE);
    if (existingAccount) {
      expect(session.accountId).toBe(existingAccount.id);
    }
    expect(session.activeProfileId).toBeNull();
    expect(session.oidcSessionKey).toBeNull();
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers().pragma).toBe('no-cache');
    expect(response.headers()['set-cookie']).toBeUndefined();
  });
}

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

test('API는 서명이 잘못된 shared-client ID token을 Kosmo 세션으로 교환하지 않는다', async ({
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
  await expect(page).toHaveURL(/\/first-profile\/handle$/);

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
  await expect(page.getByRole('link', { name: 'KOSMO에서 계속하기' })).toBeVisible();
});

for (const scenario of invalidSessionCases) {
  test(`${scenario.name}으로 보호 라우트에 진입하면 루트로 이동한다`, async ({ context, page }) => {
    await setE2ESessionCookie(context, await scenario.token());
    await page.goto('/home');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'KOSMO에서 계속하기' })).toBeVisible();
    await expect(page.getByRole('link', { name: '홈', exact: true })).toHaveCount(0);
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

  test('Settings route-owned back은 direct detail에서 root로 돌아가고 내부 이동에서는 forward로 detail을 복원한다', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 768 });

    await page.goto('/home');
    await expect(page).toHaveURL(/\/home$/);

    await page.goto('/settings/default-post-visibility');
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { name: '프로필 설정' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '설정으로 돌아가기' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '설정 목록' })).toHaveCount(0);

    await page.getByRole('button', { name: '설정으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '프로필 설정' })).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '프로필 설정' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup')).toHaveCount(0);

    await page.getByRole('link', { name: '프로필 설정 열기' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { name: '프로필 설정' })).toHaveCount(1);

    await page.getByRole('button', { name: '설정으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '프로필 설정' })).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { name: '프로필 설정' })).toBeVisible();
    await expect(page.getByText('앱을 불러오지 못했어요 잠시 후 다시 시도해주세요.')).toHaveCount(
      0,
    );
  });

  test('900px direct Settings nested back은 category를 거쳐 root로 돌아간다', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 900 });

    await page.goto('/home');
    await page.goto('/settings/blocked-profiles');
    await expect(page).toHaveURL(/\/settings\/blocked-profiles$/);

    await page.getByRole('button', { name: '뮤트 및 차단으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/settings\/mute-and-block$/);

    await page.getByRole('button', { name: '설정으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('full Web Settings cross-master back은 root로 돌아가고 두 단계 forward로 상세를 복원한다', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto('/settings');

    await page.getByRole('link', { name: '프로필 설정 열기' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await page.getByRole('link', { name: '정보 설정 열기' }).click();
    await expect(page).toHaveURL(/\/settings\/info$/);

    await page.getByRole('button', { name: '설정으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { name: '프로필 설정' })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/info$/);
    await expect(page.getByRole('heading', { name: '정보' })).toBeVisible();
  });

  test('테마 설정은 라디오 선택과 저장된 resolved theme을 유지한다', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 768 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings/theme');
    await page.evaluate(() => localStorage.removeItem('kosmo.theme-preference'));
    await page.reload();

    await expect(page).toHaveURL(/\/settings\/theme$/);
    await expect(page.getByRole('heading', { exact: true, name: '테마' })).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(
      page.getByRole('radio', { name: '시스템: 기기 색상 모드를 따라요.' }),
    ).toBeChecked();
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FFFFFF');

    await page.getByRole('radio', { name: '다크' }).click();
    await expect(page.getByRole('radio', { name: '다크' })).toBeChecked();
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');

    await page.goto('/settings');
    await expect(
      page.getByRole('link', { name: '테마 설정 열기, 다크', exact: true }),
    ).toContainText('다크');
    await page.reload();
    await expect(
      page.getByRole('link', { name: '테마 설정 열기, 다크', exact: true }),
    ).toContainText('다크');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');

    await page.getByRole('link', { name: '테마 설정 열기, 다크', exact: true }).click();
    await page.getByRole('radio', { name: '시스템: 기기 색상 모드를 따라요.' }).click();
    await expect(
      page.getByRole('radio', { name: '시스템: 기기 색상 모드를 따라요.' }),
    ).toBeChecked();
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FFFFFF');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(() => page.locator('meta[name="theme-color"]').getAttribute('content'))
      .toBe('#000000');

    await page.getByRole('button', { name: '설정으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/theme$/);
    await expect(page.getByRole('heading', { exact: true, name: '테마' })).toBeVisible();
  });

  test('테마 설정 저장소 오류는 Toast를 보이고 현재 선택을 유지한다', async ({ page }) => {
    await page.addInitScript(() => {
      const storageKey = 'kosmo.theme-preference';
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;

      Storage.prototype.getItem = function (key) {
        if (key === storageKey) {
          throw new Error('theme read failed');
        }
        return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === storageKey) {
          throw new Error('theme write failed');
        }
        return setItem.call(this, key, value);
      };
    });

    await page.goto('/settings/theme');
    await expect(
      page.getByRole('radio', { name: '시스템: 기기 색상 모드를 따라요.' }),
    ).toBeChecked();
    await expect(page.getByRole('alert')).toContainText(
      '테마 설정을 불러오지 못했어요. 시스템 설정으로 시작합니다.',
    );

    await page.getByRole('radio', { name: '다크' }).click();
    await expect(page.getByRole('radio', { name: '다크' })).toBeChecked();
    await expect(page.getByRole('alert')).toContainText(
      '테마 설정을 저장하지 못했어요. 현재 선택은 유지됩니다.',
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

  test('retired /compose route does not render a Composer', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto('/compose');

    await expect(page).toHaveURL(/\/compose$/);
    await expect(page.getByText('프로필을 찾을 수 없어요', { exact: true })).toBeVisible();
    await expect(page.getByLabel('게시글 작성', { exact: true })).toHaveCount(0);
  });

  test('/search에서 보호 shell과 검색 입력을 본다', async ({ page }) => {
    await page.goto('/search');

    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '검색어' })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });

  test('web shell은 document scroll을 유지한다', async ({ context, page }) => {
    const viewer = await createE2ESession({ handle: 'e2e-shell-scroll' });
    await setE2ESessionCookie(context, viewer.token);
    for (let index = 0; index < 8; index += 1) {
      await createE2EPost({
        body: `shell scroll post ${index} ${'긴 본문 '.repeat(20)}`,
        profileId: viewer.profile!.id,
      });
    }
    await page.setViewportSize({ height: 360, width: 1440 });
    await page.goto('/local');

    await expect(page.getByText('shell scroll post 0')).toBeVisible();

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

  test('mobile 알림 route는 64px header에 진입점을 둔다', async ({ page }) => {
    await page.setViewportSize({ height: 667, width: 390 });

    for (const route of [{ heading: '알림', path: '/notifications' }]) {
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
          node?: { __typename?: string; id?: string; relativeHandle?: string } | null;
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
    expect(await home.boundingBox()).toMatchObject({ height: 45, width: 288 });
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

for (const action of ['답글', '북마크']) {
  test(`공개 루트의 ${action} 참여는 쿠키 없는 방문자에게 기존 인증을 시작한다`, async ({
    context,
    page,
  }) => {
    const author = await createE2EProfile({ handle: 'guest_action_author' });
    await createE2EPost({ body: 'E2E guest participation post', profileId: author.id });
    await page.goto('/');
    const post = page.getByRole('article').filter({
      has: page.getByText('E2E guest participation post', { exact: true }),
    });
    await expect(post).toBeVisible();
    expect((await context.cookies()).some(({ name }) => name === 'kosmo_session')).toBe(false);

    const loginRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/login' && request.isNavigationRequest(),
    );
    await post.getByRole('button', { name: action, exact: true }).click();
    await loginRequest;

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: '프로필을 만들어 시작하세요' })).toBeVisible();
    await expect(page.getByRole('region', { name: '가입 안내', exact: true })).toHaveCount(0);
    expect((await context.cookies()).some(({ name }) => name === 'kosmo_session')).toBe(true);
  });
}
