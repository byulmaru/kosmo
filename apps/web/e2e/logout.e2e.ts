import { sessionName } from '@kosmo/core';
import { db, Sessions } from '@kosmo/core/db';
import { SessionState } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

const logoutSurfaces = [
  { name: 'full sidebar', viewport: { height: 800, width: 1440 } },
  { name: 'compact rail', viewport: { height: 800, width: 1024 } },
  { name: 'mobile drawer', viewport: { height: 667, width: 390 } },
] as const;

test.beforeEach(async () => {
  await resetE2EDatabase();
});

for (const surface of logoutSurfaces) {
  test(`${surface.name} 로그아웃은 현재 Session을 폐기하고 guest로 전환한다`, async ({
    context,
    page,
  }) => {
    const firstViewer = await createE2ESession({
      displayName: `E2E Logout ${surface.name}`,
      handle: `e2e-logout-${surface.name.replaceAll(' ', '-')}`,
    });
    const nextViewer = await createE2ESession({
      displayName: `E2E Next ${surface.name}`,
      handle: `e2e-next-${surface.name.replaceAll(' ', '-')}`,
    });

    await setE2ESessionCookie(context, firstViewer.token);
    await page.setViewportSize(surface.viewport);
    await page.goto('/home');

    const logout = await logoutControl(page, surface.name);
    const logoutRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/logout',
    );
    const logoutResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/logout',
    );

    await logout.click();

    const request = await logoutRequest;
    const response = await logoutResponse;

    expect(request.method()).toBe('POST');
    expect(response.status()).toBe(204);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toHaveCount(0);
    expect(await sessionCookie(context)).toBeUndefined();
    expect(await readSessionState(firstViewer.session.id)).toBe(SessionState.REVOKED);

    await setE2ESessionCookie(context, nextViewer.token);
    await page.goto('/home');

    await expect(page.getByRole('link', { exact: true, name: '프로필' })).toHaveAttribute(
      'href',
      `/@${nextViewer.profile?.handle}`,
    );
    await expect(page.locator(`a[href="/@${firstViewer.profile?.handle}"]`)).toHaveCount(0);
    expect(await readSessionState(nextViewer.session.id)).toBe(SessionState.ACTIVE);
  });
}

test('결과 불명 실패는 Session과 화면을 유지하고 중복 실행 없이 재시도한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Logout Retry',
    handle: 'e2e-logout-retry',
  });
  let releaseFirstLogout!: () => void;
  const firstLogoutPaused = new Promise<void>((resolve) => {
    releaseFirstLogout = resolve;
  });
  let logoutRequestCount = 0;

  await setE2ESessionCookie(context, viewer.token);
  await page.setViewportSize({ height: 800, width: 1440 });
  await page.route('**/logout', async (route) => {
    logoutRequestCount += 1;

    if (logoutRequestCount === 1) {
      await firstLogoutPaused;
      await route.fulfill({ body: 'temporary logout failure', status: 503 });
      return;
    }

    await route.continue();
  });
  await page.goto('/home');

  const logout = page.getByRole('button', { name: '로그아웃' });

  await logout.click();
  await expect.poll(() => logoutRequestCount).toBe(1);
  await expect(logout).toBeDisabled();
  await expect(logout).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('progressbar', { name: '로그아웃 처리 중' })).toBeVisible();

  await logout.dispatchEvent('click');
  await expect.poll(() => logoutRequestCount).toBe(1);

  releaseFirstLogout();

  await expect(page.getByRole('alert')).toHaveText('로그아웃하지 못했습니다. 다시 시도해주세요.');
  await expect(logout).toBeEnabled();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
  expect((await sessionCookie(context))?.value).toBe(viewer.token);
  expect(await readSessionState(viewer.session.id)).toBe(SessionState.ACTIVE);

  await page.unroute('**/logout');
  const retryResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/logout',
  );

  await logout.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await retryResponse).status()).toBe(204);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
  expect(await sessionCookie(context)).toBeUndefined();
  expect(await readSessionState(viewer.session.id)).toBe(SessionState.REVOKED);
});

test('화면을 연 뒤 이미 폐기된 Session도 로그아웃 성공으로 정리한다', async ({ context, page }) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Already Revoked Logout',
    handle: 'e2e-already-revoked-logout',
  });

  await setE2ESessionCookie(context, viewer.token);
  await page.setViewportSize({ height: 800, width: 1440 });
  await page.goto('/home');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await db
    .update(Sessions)
    .set({ state: SessionState.REVOKED })
    .where(eq(Sessions.id, viewer.session.id));

  const logoutResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/logout',
  );

  await page.getByRole('button', { name: '로그아웃' }).click();

  expect((await logoutResponse).status()).toBe(204);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
  expect(await sessionCookie(context)).toBeUndefined();
  expect(await readSessionState(viewer.session.id)).toBe(SessionState.REVOKED);
});

async function logoutControl(page: Page, surface: (typeof logoutSurfaces)[number]['name']) {
  if (surface === 'mobile drawer') {
    await page.getByRole('button', { name: '메뉴 열기' }).click();

    return page.locator('#mobile-sidebar').getByRole('button', { name: '로그아웃' });
  }

  return page.getByRole('button', { name: '로그아웃' });
}

async function readSessionState(sessionId: string) {
  return await db
    .select({ state: Sessions.state })
    .from(Sessions)
    .where(eq(Sessions.id, sessionId))
    .then((sessions) => sessions[0]?.state);
}

async function sessionCookie(context: BrowserContext) {
  return (await context.cookies()).find(({ name }) => name === sessionName);
}
