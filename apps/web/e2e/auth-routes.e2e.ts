import { SessionState } from '@kosmo/core/enums';
import { expect, test } from '@playwright/test';
import {
  closeE2EDatabase,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';

const loginCodeVerifierCookie = 'kosmo_oidc_code_verifier';
const loginStateCookie = 'kosmo_oidc_state';
const protectedHeadingRoutes = [
  { heading: '홈', path: '/home' },
  { heading: '글쓰기', path: '/compose' },
  { heading: '알림', path: '/notifications' },
  { heading: '메뉴', path: '/menu' },
] as const;

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test.afterAll(async () => {
  await closeE2EDatabase();
});

test('비로그인 사용자는 루트 온보딩에서 로그인 진입점을 본다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /나만의 타임라인/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
});

test('mock OIDC로 로그인하면 보호 홈으로 이동하고 세션이 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '시작하기' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: '프로필을 만들어 시작하세요' })).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
});

test('비로그인 보호 라우트 진입은 스플래시 후 루트로 이동한다', async ({ page }) => {
  let releaseProtectedLayoutQuery: (() => void) | null = null;
  let resolveProtectedLayoutPaused!: () => void;
  const protectedLayoutPaused = new Promise<void>((resolve) => {
    resolveProtectedLayoutPaused = resolve;
  });

  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';

    if (!releaseProtectedLayoutQuery && body.includes('ProtectedLayoutQuery')) {
      await new Promise<void>((resolve) => {
        releaseProtectedLayoutQuery = resolve;
        resolveProtectedLayoutPaused();
      });
    }

    await route.continue();
  });

  const navigation = page.goto('/home');

  await protectedLayoutPaused;
  await expect(page.getByTestId('auth-splash')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);

  releaseProtectedLayoutQuery?.();
  await navigation;

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
});

test('무효 세션 쿠키로 보호 라우트에 진입하면 루트로 이동한다', async ({ context, page }) => {
  const { token } = await createE2ESession({ sessionState: SessionState.REVOKED });

  await setE2ESessionCookie(context, token);
  await page.goto('/home');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
});

test('OIDC callback은 허용되지 않은 redirect_uri를 거부한다', async ({
  baseURL,
  context,
  page,
}) => {
  const state = 'e2e-invalid-redirect-state';
  const callbackUrl = new URL('/login/callback', baseURL).toString();

  await context.addCookies([
    {
      httpOnly: true,
      name: loginStateCookie,
      path: '/login/callback',
      sameSite: 'Lax',
      url: callbackUrl,
      value: state,
    },
    {
      httpOnly: true,
      name: loginCodeVerifierCookie,
      path: '/login/callback',
      sameSite: 'Lax',
      url: callbackUrl,
      value: 'e2e-code-verifier',
    },
  ]);

  const response = await page.goto(
    `/login/callback?code=e2e-code&state=${state}&redirect_uri=${encodeURIComponent(
      'https://evil.example/callback',
    )}`,
  );

  expect(response?.status()).toBe(400);
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
      await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
      await expect(page.getByTestId('auth-splash')).toHaveCount(0);
    });
  }

  test('/search에서 보호 shell과 검색 입력을 본다', async ({ page }) => {
    await page.goto('/search');

    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '검색어' })).toBeVisible();
    await expect(page.getByTestId('auth-splash')).toHaveCount(0);
  });
});
