import { randomUUID } from 'node:crypto';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation } from './graphql';
import type { APIRequestContext } from '@playwright/test';

const loginCodeVerifierCookie = 'kosmo_oidc_code_verifier';
const loginStateCookie = 'kosmo_oidc_state';
const oidcOrigin = 'http://127.0.0.1:4300';
const protectedHeadingRoutes = [
  { heading: '홈', path: '/home' },
  { heading: '글쓰기', path: '/compose' },
  { heading: '알림', path: '/notifications' },
  { heading: '메뉴', path: '/menu' },
] as const;
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

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('비로그인 사용자는 루트 온보딩에서 로그인 진입점을 본다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /나만의 타임라인/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
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

  await expect(page.getByRole('heading', { name: /나만의 타임라인/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '시작하기' })).toHaveAttribute('href', '/login');
});

test('mock OIDC로 로그인하면 보호 홈으로 이동하고 세션이 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '시작하기' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: '프로필을 만들어 시작하세요' })).toBeVisible();
  await page.getByRole('button', { name: '프로필 만들기' }).click();
  await expect(page.getByRole('menu', { name: '프로필 전환' })).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
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
});
