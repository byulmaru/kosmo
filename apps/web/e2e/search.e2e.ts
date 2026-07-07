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

async function setRecentSearchesBeforeNavigation(page: Page, terms: string[]) {
  await page.addInitScript(
    ({ storageKey, recentTerms }) => {
      if (recentTerms.length === 0) {
        localStorage.removeItem(storageKey);
        return;
      }

      localStorage.setItem(storageKey, JSON.stringify(recentTerms));
    },
    { storageKey: recentSearchesKey, recentTerms: terms },
  );
}

function isSearchPeopleRequest(body: string) {
  return body.includes('SearchPeopleByHandlePageQuery');
}

async function expectSearchTabSelected(page: Page, name: string) {
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

async function expectPeopleTabSelected(page: Page) {
  await expectSearchTabSelected(page, '사람');
}

async function expectSearchParams(page: Page, expected: Record<string, string>) {
  await expect
    .poll(() => {
      const url = new URL(page.url());

      return {
        pathname: url.pathname,
        ...Object.fromEntries(Object.keys(expected).map((key) => [key, url.searchParams.get(key)])),
      };
    })
    .toEqual({ pathname: '/search', ...expected });
}

async function expectSearchParamAbsent(page: Page, key: string) {
  await expect
    .poll(() => {
      const url = new URL(page.url());

      expect(url.pathname).toBe('/search');
      return url.searchParams.get(key);
    })
    .toBeNull();
}

async function expectRecentSearches(page: Page, terms: string[]) {
  const stored = await page.evaluate((storageKey) => {
    return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[];
  }, recentSearchesKey);

  expect(stored).toEqual(terms);
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('검색 전 상태에서 검색어 입력에 포커스하면 최근 검색 영역을 본다', async ({
  context,
  page,
}) => {
  await signInSearchUser(context);
  await setRecentSearchesBeforeNavigation(page, []);

  await page.goto('/search');

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole('textbox', { name: '검색어' })).toBeVisible();
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);
  await expect(page.getByText('최근 검색', { exact: true })).toHaveCount(0);

  await page.getByRole('textbox', { name: '검색어' }).focus();

  await expect(page.getByText('최근 검색', { exact: true })).toBeVisible();
  await expect(page.getByText('아직 최근 검색이 없어요.')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);
});

test('공백만 있는 q는 검색 후 단계나 최근 검색으로 처리하지 않는다', async ({ context, page }) => {
  await signInSearchUser(context);
  await setRecentSearchesBeforeNavigation(page, []);

  await page.goto('/search?q=%20%20%20&tab=people');

  const searchInput = page.getByRole('textbox', { name: '검색어' });
  await expect(searchInput).toHaveValue('   ');
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);

  await searchInput.focus();

  await expect(page.getByText('아직 최근 검색이 없어요.')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);
});

test('공백 q와 사람 외 탭은 사람 검색 GraphQL을 요청하지 않는다', async ({ context, page }) => {
  const handle = 'e2e-no-people-query-target';
  let peopleRequestCount = 0;

  await signInSearchUser(context, { handle });
  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';

    if (isSearchPeopleRequest(body)) {
      peopleRequestCount += 1;
    }

    await route.continue();
  });

  await page.goto('/search?q=%20%20%20&tab=people');

  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);
  expect(peopleRequestCount).toBe(0);

  await page.goto(`/search?q=${handle}&tab=popular`);

  await expectSearchParams(page, { q: handle, tab: 'popular' });
  await expectSearchTabSelected(page, '인기');
  await expect(page.getByText('준비 중인 검색이에요')).toBeVisible();
  expect(peopleRequestCount).toBe(0);

  const tabCases = [
    { name: '최신', tab: 'latest', message: '최신 검색은 곧 제공될 예정이에요.' },
    { name: '미디어', tab: 'media', message: '미디어 검색은 곧 제공될 예정이에요.' },
  ];

  for (const { name, tab, message } of tabCases) {
    await page.getByRole('tab', { name }).click();

    await expectSearchParams(page, { q: handle, tab });
    await expectSearchTabSelected(page, name);
    await expect(page.getByText(message)).toBeVisible();
    expect(peopleRequestCount).toBe(0);
  }
});
test('저장된 최근 검색을 표시하고 개별 항목을 삭제한다', async ({ context, page }) => {
  await signInSearchUser(context);
  await setRecentSearchesBeforeNavigation(page, ['recent-alpha', 'recent-beta']);

  await page.goto('/search');
  await page.getByRole('textbox', { name: '검색어' }).focus();

  await expect(page.getByText('최근 검색', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'recent-alpha' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'recent-beta' })).toBeVisible();

  await page.getByRole('button', { name: "최근 검색 'recent-alpha' 삭제" }).click();

  await expectRecentSearches(page, ['recent-beta']);
  await page.getByRole('textbox', { name: '검색어' }).focus();
  await expect(page.getByRole('link', { name: 'recent-alpha' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'recent-beta' })).toBeVisible();
});

test('최근 검색 항목을 선택하면 해당 검색어로 다시 검색한다', async ({ context, page }) => {
  const handle = 'e2e-recent-target';
  const displayName = 'E2E 최근 검색 대상';

  await signInSearchUser(context, { displayName, handle });
  await setRecentSearchesBeforeNavigation(page, [handle]);

  await page.goto('/search');
  await page.getByRole('textbox', { name: '검색어' }).focus();
  await page.getByRole('link', { name: handle }).click();

  await expectSearchParams(page, { q: handle, tab: 'people' });
  await expectPeopleTabSelected(page);
  await expect(page.getByRole('link', { name: new RegExp(displayName) })).toHaveAttribute(
    'href',
    `/@${handle}`,
  );
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
  await expectSearchParams(page, { q: handle, tab: 'people' });
  await expectPeopleTabSelected(page);
  const profileLink = page.getByRole('link', { name: new RegExp(displayName) });
  await expect(profileLink).toHaveAttribute('href', `/@${handle}`);
  await expect(profileLink).toContainText(`@${handle}`);
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

test('사람 외 탭으로 전환하면 q를 유지하고 준비 중 안내를 보여준다', async ({ context, page }) => {
  const handle = 'e2e-tab-target';

  await signInSearchUser(context, { handle });
  await page.goto(`/search?q=${handle}`);

  const tabCases = [
    { name: '인기', tab: 'popular', message: '인기 검색은 곧 제공될 예정이에요.' },
    { name: '최신', tab: 'latest', message: '최신 검색은 곧 제공될 예정이에요.' },
    { name: '미디어', tab: 'media', message: '미디어 검색은 곧 제공될 예정이에요.' },
  ];

  for (const { name, tab, message } of tabCases) {
    await page.getByRole('tab', { name }).click();

    await expectSearchParams(page, { q: handle, tab });
    await expectSearchTabSelected(page, name);
    await expect(page.getByText('준비 중인 검색이에요')).toBeVisible();
    await expect(page.getByText(message)).toBeVisible();
  }
});

test('사람 외 탭에서 검색어를 다시 제출해도 활성 탭을 유지한다', async ({ context, page }) => {
  const handle = 'e2e-submit-tab-initial';
  const nextQuery = 'e2e-submit-tab-next';

  await signInSearchUser(context, { handle });
  await page.goto(`/search?q=${handle}`);

  const tabCases = [
    { name: '인기', tab: 'popular', message: '인기 검색은 곧 제공될 예정이에요.' },
    { name: '최신', tab: 'latest', message: '최신 검색은 곧 제공될 예정이에요.' },
    { name: '미디어', tab: 'media', message: '미디어 검색은 곧 제공될 예정이에요.' },
  ];

  let currentQuery = handle;

  for (const { name, tab, message } of tabCases) {
    const submittedQuery = `${nextQuery}-${tab}`;

    await page.getByRole('tab', { name }).click();
    await expectSearchParams(page, { q: currentQuery, tab });

    const searchInput = page.getByRole('textbox', { name: '검색어' });
    await searchInput.fill(submittedQuery);
    await searchInput.press('Enter');

    await expectSearchParams(page, { q: submittedQuery, tab });
    await expectSearchTabSelected(page, name);
    await expect(page.getByText('준비 중인 검색이에요')).toBeVisible();
    await expect(page.getByText(message)).toBeVisible();

    currentQuery = submittedQuery;
  }
});
test('존재하지 않는 handle 검색은 결과 없음 상태를 보여준다', async ({ context, page }) => {
  const missingHandle = 'e2e-missing-profile';

  await signInSearchUser(context);
  await page.goto(`/search?q=${missingHandle}&tab=people`);

  await expectPeopleTabSelected(page);
  await expect(page.getByText('검색 결과가 없어요')).toBeVisible();
  await expect(
    page.getByText(`'${missingHandle}'에 해당하는 프로필을 찾지 못했어요.`),
  ).toBeVisible();
});

test('사람 검색 실패 시 오류 상태와 다시 시도를 제공한다', async ({ context, page }) => {
  let peopleRequestCount = 0;

  await signInSearchUser(context);
  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';

    if (isSearchPeopleRequest(body)) {
      peopleRequestCount += 1;
      await route.fulfill({
        contentType: 'application/json',
        status: 500,
        body: JSON.stringify({ errors: [{ message: 'E2E forced search error' }] }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/search?q=e2e-error-target&tab=people');

  await expect(page.getByRole('alert')).toContainText('검색 결과를 불러오지 못했어요');
  const previousCount = peopleRequestCount;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect.poll(() => peopleRequestCount).toBeGreaterThan(previousCount);
});

test('기존 사람 검색 결과가 있어도 다음 검색 실패 시 오류 상태와 다시 시도를 제공한다', async ({
  context,
  page,
}) => {
  const existingHandle = 'e2e-existing-result';
  const failingHandle = 'e2e-existing-result-error';
  const displayName = 'E2E 기존 결과';
  let failingRequestCount = 0;

  await signInSearchUser(context, { displayName, handle: existingHandle });
  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';

    if (isSearchPeopleRequest(body) && body.includes(failingHandle)) {
      failingRequestCount += 1;
      await route.fulfill({
        contentType: 'application/json',
        status: 500,
        body: JSON.stringify({ errors: [{ message: 'E2E forced search error' }] }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto(`/search?q=${existingHandle}&tab=people`);

  const existingProfileLink = page.getByRole('link', { name: new RegExp(displayName) });
  await expect(existingProfileLink).toHaveAttribute('href', `/@${existingHandle}`);
  await expect(existingProfileLink).toContainText(`@${existingHandle}`);

  const searchInput = page.getByRole('textbox', { name: '검색어' });
  await searchInput.fill(failingHandle);
  await searchInput.press('Enter');

  await expectSearchParams(page, { q: failingHandle, tab: 'people' });
  await expect.poll(() => failingRequestCount).toBeGreaterThan(0);
  await expect(existingProfileLink).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('검색 결과를 불러오지 못했어요');

  const previousCount = failingRequestCount;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect.poll(() => failingRequestCount).toBeGreaterThan(previousCount);
});

test('검색 지우기와 뒤로가기 컨트롤은 q를 제거하고 검색 전 단계로 돌린다', async ({
  context,
  page,
}) => {
  const handle = 'e2e-control-target';

  await signInSearchUser(context, { handle });
  await page.goto(`/search?q=${handle}&tab=people`);

  const searchInput = page.getByRole('textbox', { name: '검색어' });
  await page.getByRole('button', { name: '검색 지우기' }).click();

  await expect(searchInput).toHaveValue('');
  await expectSearchParams(page, { tab: 'people' });
  await expectSearchParamAbsent(page, 'q');
  await expect(searchInput).toBeFocused();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);

  await searchInput.fill(handle);
  await searchInput.press('Enter');

  await expect(page).toHaveURL(/\/search\?/);
  await expectSearchParams(page, { q: handle, tab: 'people' });
  await page.getByRole('link', { name: '뒤로' }).click();

  await expectSearchParams(page, { tab: 'people' });
  await expectSearchParamAbsent(page, 'q');
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);
});
