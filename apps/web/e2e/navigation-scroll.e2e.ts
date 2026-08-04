import {
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation } from './graphql';
import type { Locator, Page } from '@playwright/test';

const recentSearchesKey = 'kosmo:recent-searches';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test.use({ hasTouch: true });

async function signIn(page: Page, handle = 'e2e-navigation-scroll') {
  const session = await createE2ESession({ handle });
  await setE2ESessionCookie(page.context(), session.token);
  return session;
}

async function visiblePrimaryNavigation(page: Page): Promise<Locator> {
  const navigations = page.getByRole('navigation', { name: '주요 메뉴' });
  await expect(navigations.first()).toBeAttached();

  for (const navigation of await navigations.all()) {
    if (await navigation.isVisible()) {
      return navigation;
    }
  }

  throw new Error('Visible primary navigation was not found.');
}

async function scrollDocument(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
}

async function waitAnimationFrames(page: Page, count = 4) {
  await page.evaluate((frameCount) => {
    return new Promise<void>((resolve) => {
      let completed = 0;
      const tick = () => {
        completed += 1;
        if (completed >= frameCount) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, count);
}

test('주요 Web navigation은 mobile bottom tab, drawer, compact rail과 full sidebar에서 document top으로 이동한다', async ({
  page,
}) => {
  await signIn(page);

  for (const surface of [
    { name: 'full sidebar', viewport: { height: 360, width: 1440 }, target: '알림' },
    { name: 'compact rail', viewport: { height: 360, width: 1024 }, target: '알림' },
    { name: 'mobile bottom tab', viewport: { height: 360, width: 390 }, target: '알림' },
  ]) {
    await page.setViewportSize(surface.viewport);
    await page.goto('/compose');
    await expect(page.getByRole('textbox', { name: '게시글 본문' }).first()).toBeVisible();
    await scrollDocument(page);

    const navigation = await visiblePrimaryNavigation(page);
    const targetLink = navigation.getByRole('link', { name: surface.target, exact: true });
    if (surface.name === 'mobile bottom tab') {
      await targetLink.tap();
    } else {
      await targetLink.click();
    }

    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByText('아직 알림이 없어요')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  }

  await page.setViewportSize({ height: 360, width: 390 });
  await page.goto('/compose');
  await expect(page.getByRole('textbox', { name: '게시글 본문' }).first()).toBeVisible();
  await scrollDocument(page);
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  const drawerNavigation = page
    .locator('#mobile-sidebar')
    .getByRole('navigation', { name: '주요 메뉴' });
  await drawerNavigation.getByRole('link', { name: '홈', exact: true }).tap();

  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('팔로워 요청 진입점은 full, compact와 mobile drawer에서 canonical route를 연다', async ({
  page,
}) => {
  await signIn(page, 'e2e-follow-request-navigation');

  for (const viewport of [
    { height: 720, width: 1440 },
    { height: 720, width: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/home');
    const navigation = await visiblePrimaryNavigation(page);
    const link = navigation.getByRole('link', { name: '팔로워 요청', exact: true });
    await expect(link).toHaveAttribute('href', '/follow-requests');
    await expect(navigation.locator('a[href="/menu"]')).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(/\/follow-requests$/);
    await expect(page.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
    await expect(
      (await visiblePrimaryNavigation(page)).getByRole('link', {
        name: '팔로워 요청',
        exact: true,
      }),
    ).toHaveAttribute('aria-current', 'page');
  }

  await page.setViewportSize({ height: 720, width: 390 });
  await page.goto('/home');
  await expect(
    (await visiblePrimaryNavigation(page)).getByRole('link', {
      name: '팔로워 요청',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  const drawer = page.locator('#mobile-sidebar');
  const drawerNavigation = drawer.getByRole('navigation', { name: '주요 메뉴' });
  const drawerLink = drawerNavigation.getByRole('link', {
    name: '팔로워 요청',
    exact: true,
  });
  await expect(drawerLink).toHaveAttribute('href', '/follow-requests');
  await expect(drawerNavigation.locator('a[href="/menu"]')).toHaveCount(0);
  await drawerLink.tap();
  await expect(page).toHaveURL(/\/follow-requests$/);
  await expect(page.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
  await expect(drawer).toHaveCount(0);
});

test('loading target도 pathname commit 직후 이전 document offset을 노출하지 않는다', async ({
  page,
}) => {
  await signIn(page, 'e2e-navigation-loading');
  await page.setViewportSize({ height: 360, width: 1440 });
  await page.goto('/compose');
  await expect(page.getByRole('textbox', { name: '게시글 본문' }).first()).toBeVisible();
  await scrollDocument(page);

  let releaseHomeQuery!: () => void;
  let resolveHomeQueryStarted!: () => void;
  let resolveHomeQueryHandled!: () => void;
  const homeQueryStarted = new Promise<void>((resolve) => {
    resolveHomeQueryStarted = resolve;
  });
  const homeQueryHandled = new Promise<void>((resolve) => {
    resolveHomeQueryHandled = resolve;
  });
  const homeQueryRelease = new Promise<void>((resolve) => {
    releaseHomeQuery = resolve;
  });

  await page.route('**/graphql', async (route) => {
    if (isGraphQLOperation(route.request().postData(), 'HomePageQuery')) {
      resolveHomeQueryStarted();
      const response = await route.fetch();
      await homeQueryRelease;
      await route.fulfill({ response });
      resolveHomeQueryHandled();
      return;
    }
    await route.continue();
  });

  try {
    const navigation = await visiblePrimaryNavigation(page);
    await navigation.getByRole('link', { name: '홈', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await homeQueryStarted;
    await expect(page.getByText('홈을 불러오는 중입니다.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await navigation.getByRole('link', { name: '알림', exact: true }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByText('아직 알림이 없어요')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  } finally {
    releaseHomeQuery();
    await homeQueryHandled;
    await page.unroute('**/graphql');
  }
});

test('search query-only 이동은 document scroll과 입력 focus를 보존하고 history traversal을 reset하지 않는다', async ({
  page,
}) => {
  const session = await signIn(page, 'e2e-navigation-search');
  const firstQueryProfiles = Array.from({ length: 20 }, (_, index) => `e2e-query-first-${index}`);
  const secondQueryProfiles = Array.from({ length: 20 }, (_, index) => `e2e-query-second-${index}`);

  for (const handle of [...firstQueryProfiles, ...secondQueryProfiles]) {
    await createE2EProfile({ handle });
  }
  for (let index = 0; index < 20; index += 1) {
    await createE2EPost({
      body: `E2E navigation history post ${index} ${'긴 본문 '.repeat(20)}`,
      profileId: session.profile!.id,
    });
  }

  await page.setViewportSize({ height: 360, width: 1440 });
  await page.addInitScript(
    ({ storageKey }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify([
          'e2e-query-second',
          ...Array.from({ length: 20 }, (_, index) => `e2e-recent-${index}`),
        ]),
      );
    },
    { storageKey: recentSearchesKey },
  );
  await page.goto('/search?q=e2e-query-first&tab=people');
  const input = page.getByRole('textbox', { name: '검색어' });
  await expect(input).toBeVisible();
  await expect(page.getByRole('link', { name: /e2e-query-first-0/ })).toBeVisible();
  await input.focus();
  await expect(page.getByRole('link', { name: 'e2e-query-second', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'e2e-query-second', exact: true }).click();

  await expect(page).toHaveURL(/q=e2e-query-second/);
  await expect(page.getByRole('link', { name: /e2e-query-second-0/ })).toBeVisible();
  const offsetBeforeWheel = await page.evaluate(() => {
    const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(320, maxScrollY));
    return window.scrollY;
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(offsetBeforeWheel);
  const offsetAfterWheel = await page.evaluate(() => window.scrollY);
  await waitAnimationFrames(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(offsetAfterWheel);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(offsetBeforeWheel);
  expect(offsetAfterWheel).toBeLessThan(offsetBeforeWheel);
  await expect(input).toBeFocused();

  await page.getByRole('link', { name: '뒤로', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?tab=people$/);
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  await expect(page.getByRole('link', { name: 'e2e-query-second', exact: true })).not.toBeVisible();
  await expect(input).not.toBeFocused();

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible();
  await scrollDocument(page);
  const homeScroll = await page.evaluate(() => window.scrollY);
  await (await visiblePrimaryNavigation(page))
    .getByRole('link', { name: '검색', exact: true })
    .click();
  await expect(page).toHaveURL(/\/search$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(homeScroll);

  await page.goto('/search?q=e2e-query-first&tab=people');
  const repeatedQueryInput = page.getByRole('textbox', { name: '검색어' });
  await expect(repeatedQueryInput).toBeVisible();
  await expect(page.getByRole('link', { name: /e2e-query-first-0/ })).toBeVisible();
  await repeatedQueryInput.focus();
  const historyLengthBeforeSameQuery = await page.evaluate(() => window.history.length);
  await repeatedQueryInput.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.history.length))
    .toBe(historyLengthBeforeSameQuery);

  await repeatedQueryInput.fill('e2e-query-second');
  await repeatedQueryInput.press('Enter');
  await expect(page).toHaveURL(/q=e2e-query-second/);
  await expect(page.getByRole('link', { name: /e2e-query-second-0/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/q=e2e-query-first/);
  await expect(page.getByRole('link', { name: /e2e-query-first-0/ })).toBeVisible();
  await waitAnimationFrames(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
