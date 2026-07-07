import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

const recentSearchesKey = 'kosmo:recent-searches';

async function signInSearchUser(
  context: BrowserContext,
  options: { displayName?: string; handle?: string } = {},
) {
  const session = await createE2ESession(options);

  await setE2ESessionCookie(context, session.token);

  return session;
}

async function clearRecentSearchesBeforeNavigation(page: Page) {
  await page.addInitScript((storageKey) => {
    localStorage.removeItem(storageKey);
  }, recentSearchesKey);
}

async function expectPeopleTabSelected(page: Page) {
  await expect(page.getByRole('tab', { name: '사람' })).toHaveAttribute('aria-selected', 'true');
}

function expectSearchParams(page: Page, expected: Record<string, string>) {
  const url = new URL(page.url());

  expect(url.pathname).toBe('/search');
  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key)).toBe(value);
  }
}

test.beforeEach(async ({ page }) => {
  await resetE2EDatabase();
  await clearRecentSearchesBeforeNavigation(page);
});

test('검색 전 상태에서 검색어 입력에 포커스하면 최근 검색 영역을 본다', async ({
  context,
  page,
}) => {
  await signInSearchUser(context);

  await page.goto('/search');

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole('textbox', { name: '검색어' })).toBeVisible();
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);
  await expect(page.getByText('최근 검색')).toHaveCount(0);

  await page.getByRole('textbox', { name: '검색어' }).focus();

  await expect(page.getByText('최근 검색')).toBeVisible();
  await expect(page.getByText('아직 최근 검색이 없어요.')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);
});

test('handle을 제출하면 사람 탭 결과와 프로필 링크를 본다', async ({ context, page }) => {
  const handle = 'e2e-search-target';
  const displayName = 'E2E 검색 대상';

  await signInSearchUser(context, { displayName, handle });
  await page.goto('/search');

  const searchInput = page.getByRole('textbox', { name: '검색어' });
  await searchInput.fill(handle);
  await searchInput.press('Enter');

  await expect(page).toHaveURL(/\/search\?/);
  expectSearchParams(page, { q: handle, tab: 'people' });
  await expectPeopleTabSelected(page);
  await expect(page.getByRole('link', { name: new RegExp(displayName) })).toHaveAttribute(
    'href',
    `/@${handle}`,
  );
  await expect(page.getByText(`@${handle}`)).toBeVisible();
});

test('검색어 deep-link는 tab이 없거나 알 수 없어도 사람 탭 결과를 보여준다', async ({
  context,
  page,
}) => {
  const handle = 'e2e-search-deeplink';
  const displayName = 'E2E 딥링크 대상';

  await signInSearchUser(context, { displayName, handle });

  await page.goto(`/search?q=${handle}`);
  await expectPeopleTabSelected(page);
  await expect(page.getByRole('link', { name: new RegExp(displayName) })).toHaveAttribute(
    'href',
    `/@${handle}`,
  );

  await page.goto(`/search?q=${handle}&tab=unknown`);
  await expectPeopleTabSelected(page);
  await expect(page.getByRole('link', { name: new RegExp(displayName) })).toHaveAttribute(
    'href',
    `/@${handle}`,
  );
});
