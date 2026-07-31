import {
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation, readGraphQLOperation } from './graphql';
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
      localStorage.setItem(storageKey, JSON.stringify(recentTerms));
    },
    { storageKey: recentSearchesKey, recentTerms: terms },
  );
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

async function expectTabSelected(page: Page, name: string) {
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('검색 전 상태와 최근 검색을 React Native Web semantics로 표시한다', async ({
  context,
  page,
}) => {
  await signInSearchUser(context);
  await setRecentSearchesBeforeNavigation(page, []);
  await page.goto('/search');

  const input = page.getByRole('textbox', { name: '검색어' });
  await expect(input).toBeVisible();
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);

  await input.focus();
  await expect(page.getByText('최근 검색', { exact: true })).toBeVisible();
  await expect(page.getByText('아직 최근 검색이 없어요.')).toBeVisible();
});

test('공백 검색은 사람 Relay query를 요청하지 않는다', async ({ context, page }) => {
  let peopleRequestCount = 0;
  await signInSearchUser(context);
  await page.route('**/graphql', async (route) => {
    if (isGraphQLOperation(route.request().postData(), 'SearchPeopleByHandlePageQuery')) {
      peopleRequestCount += 1;
    }
    await route.continue();
  });

  await page.goto('/search?q=%20%20%20&tab=people');
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  expect(peopleRequestCount).toBe(0);
});

test('저장된 최근 검색을 표시하고 개별 항목을 삭제한다', async ({ context, page }) => {
  await signInSearchUser(context);
  await setRecentSearchesBeforeNavigation(page, ['recent-alpha', 'recent-beta']);
  await page.goto('/search');
  await page.getByRole('textbox', { name: '검색어' }).focus();

  await expect(page.getByText('recent-alpha', { exact: true })).toBeVisible();
  await expect(page.getByText('recent-beta', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'recent-alpha' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'recent-beta' })).toBeVisible();
  await page.getByRole('button', { name: "최근 검색 'recent-alpha' 삭제" }).click();

  await expect(page.getByText('recent-alpha', { exact: true })).toHaveCount(0);
  await expect(page.getByText('최근 검색', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'recent-beta' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '검색어' })).toBeFocused();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), recentSearchesKey),
  ).toEqual(['recent-beta']);
});

test('최근 검색 항목을 선택하면 사람 검색 결과를 요청한다', async ({ context, page }) => {
  const handle = 'e2e-recent-target';
  const displayName = 'E2E 최근 검색 대상';
  await signInSearchUser(context, { displayName, handle });
  await setRecentSearchesBeforeNavigation(page, [handle]);
  await page.goto('/search');
  await page.getByRole('textbox', { name: '검색어' }).focus();
  await page.getByRole('link', { name: handle }).click({ delay: 50 });

  await expectSearchParams(page, { q: handle, tab: 'people' });
  await expectTabSelected(page, '사람');
  await expect(page.getByRole('link', { name: new RegExp(displayName) })).toHaveAttribute(
    'href',
    `/@${handle}`,
  );
});

test('handle 제출은 operationName을 포함한 Relay request와 사람 결과를 만든다', async ({
  context,
  page,
}) => {
  const handle = 'e2e-search-target';
  const displayName = 'E2E 검색 대상';
  let operationName: string | null | undefined;
  await signInSearchUser(context, { displayName, handle });
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.variables?.query === handle) {
      operationName = operation.operationName;
    }
    await route.continue();
  });
  await page.goto('/search');

  const input = page.getByRole('textbox', { name: '검색어' });
  await input.fill(handle);
  await input.press('Enter');

  await expectSearchParams(page, { q: handle, tab: 'people' });
  await expectTabSelected(page, '사람');
  await expect(page.getByRole('link', { name: new RegExp(displayName) })).toHaveAttribute(
    'href',
    `/@${handle}`,
  );
  expect(operationName).toBe('SearchPeopleByHandlePageQuery');
});

test('명시적 원격 handle은 선행 @를 GraphQL 변수에 유지하고 빈 결과 상태를 보여준다', async ({
  context,
  page,
}) => {
  const remoteHandle = '@alice@remote.example';
  let queryVariable: unknown;
  await signInSearchUser(context);
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName !== 'SearchPeopleByHandlePageQuery') {
      await route.continue();
      return;
    }

    queryVariable = operation.variables?.query;
    await route.fulfill({
      body: JSON.stringify({
        data: {
          searchProfiles: {
            edges: [],
            pageInfo: { endCursor: null, hasNextPage: false },
          },
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto(`/search?q=${encodeURIComponent(remoteHandle)}&tab=people`);

  await expect(page.getByText('검색 결과가 없어요')).toBeVisible();
  await expect(
    page.getByText(`'${remoteHandle}'에 해당하는 프로필을 찾지 못했어요.`),
  ).toBeVisible();
  expect(queryVariable).toBe(remoteHandle);
});

test('부분 handle 검색은 저장된 일치 Profile을 목록으로 표시한다', async ({ context, page }) => {
  const firstHandle = 'e2e-partial-alpha';
  const secondHandle = 'e2e-partial-beta';
  await signInSearchUser(context, { displayName: 'E2E 부분 검색 첫 결과', handle: firstHandle });
  await createE2EProfile({ displayName: 'E2E 부분 검색 두 번째 결과', handle: secondHandle });

  await page.goto('/search?q=e2e-partial&tab=people');

  await expect(page.getByRole('link', { name: /E2E 부분 검색 첫 결과/ })).toHaveAttribute(
    'href',
    `/@${firstHandle}`,
  );
  await expect(page.getByRole('link', { name: /E2E 부분 검색 두 번째 결과/ })).toHaveAttribute(
    'href',
    `/@${secondHandle}`,
  );
});

test('부분 handle 검색은 다음 페이지를 중복 없이 누적한다', async ({ context, page }) => {
  const handles = Array.from(
    { length: 21 },
    (_, index) => `e2e-page-${String(index).padStart(2, '0')}`,
  );
  await signInSearchUser(context, {
    displayName: 'E2E 페이지 결과 00',
    handle: handles[0],
  });
  for (const [index, handle] of handles.slice(1).entries()) {
    await createE2EProfile({
      displayName: `E2E 페이지 결과 ${String(index + 1).padStart(2, '0')}`,
      handle,
    });
  }

  await page.goto('/search?q=e2e-page-&tab=people');

  await expect(page.getByRole('link', { name: /E2E 페이지 결과/ })).toHaveCount(20);
  await expect(page.getByText('E2E 페이지 결과 20')).toHaveCount(0);
  await page.getByRole('button', { name: '검색 결과 더 보기' }).click();
  await expect(page.getByRole('link', { name: /E2E 페이지 결과/ })).toHaveCount(21);
  await expect(page.getByText('E2E 페이지 결과 20')).toBeVisible();
  await expect(page.getByRole('button', { name: '검색 결과 더 보기' })).toHaveCount(0);
});

test('사람 검색의 LIKE wildcard 문자는 일반 handle 문자로 처리한다', async ({ context, page }) => {
  const wildcardLookalike = 'e2e-percent-target';
  await signInSearchUser(context, {
    displayName: 'E2E 퍼센트 유사 결과',
    handle: wildcardLookalike,
  });

  await page.goto(`/search?q=${encodeURIComponent('e2e-percent%')}&tab=people`);

  await expect(page.getByRole('link', { name: /E2E 퍼센트 유사 결과/ })).toHaveCount(0);
  await expect(page.getByText('검색 결과가 없어요')).toBeVisible();
});

test('알 수 없는 tab은 사람 탭으로 정규화한다', async ({ context, page }) => {
  const handle = 'e2e-search-deeplink';
  await signInSearchUser(context, { handle });
  await page.goto(`/search?q=${handle}&tab=unknown`);

  await expectTabSelected(page, '사람');
  await expect(page.getByRole('link', { name: new RegExp(`@${handle}`) })).toHaveAttribute(
    'href',
    `/@${handle}`,
  );
});

test('사람 외 탭은 q를 유지하고 준비 중 상태를 보여준다', async ({ context, page }) => {
  const handle = 'e2e-tab-target';
  await signInSearchUser(context, { handle });
  await page.goto(`/search?q=${handle}`);

  for (const { name, tab } of [
    { name: '인기', tab: 'popular' },
    { name: '최신', tab: 'latest' },
    { name: '미디어', tab: 'media' },
  ]) {
    await page.getByRole('tab', { name }).click();
    await expectSearchParams(page, { q: handle, tab });
    await expectTabSelected(page, name);
    await expect(page.getByText('준비 중인 검색이에요')).toBeVisible();
    await expect(page.getByText(`${name} 검색은 곧 제공될 예정이에요.`)).toBeVisible();
  }
});

test('존재하지 않는 handle은 결과 없음 상태를 보여준다', async ({ context, page }) => {
  const handle = 'e2e-missing-profile';
  await signInSearchUser(context);
  await page.goto(`/search?q=${handle}&tab=people`);

  await expect(page.getByText('검색 결과가 없어요')).toBeVisible();
  await expect(page.getByText(`'${handle}'에 해당하는 프로필을 찾지 못했어요.`)).toBeVisible();
});

test('검색 지우기와 뒤로가기 컨트롤은 q를 제거하고 검색 전 단계로 돌린다', async ({
  context,
  page,
}) => {
  const handle = 'e2e-control-target';
  await signInSearchUser(context, { handle });
  await page.goto(`/search?q=${handle}&tab=people`);

  const input = page.getByRole('textbox', { name: '검색어' });
  await page.getByRole('button', { name: '검색 지우기' }).click();

  await expect(input).toHaveValue('');
  await expectSearchParams(page, { tab: 'people' });
  await expectSearchParamAbsent(page, 'q');
  await expect(input).toBeFocused();
  await expect(page.getByRole('tablist', { name: '검색 결과 유형' })).toHaveCount(0);

  await input.fill(handle);
  await input.press('Enter');
  await expectSearchParams(page, { q: handle, tab: 'people' });
  await page.getByRole('link', { name: '뒤로' }).click();

  await expectSearchParams(page, { tab: 'people' });
  await expectSearchParamAbsent(page, 'q');
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
});

test('사람 검색 실패는 검색 결과 오류 경계에서 다시 시도할 수 있다', async ({ context, page }) => {
  let peopleRequestCount = 0;
  await signInSearchUser(context);
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'SearchPeopleByHandlePageQuery')) {
      await route.continue();
      return;
    }

    peopleRequestCount += 1;
    await route.fulfill({
      body: JSON.stringify({ errors: [{ message: 'E2E forced search error' }] }),
      contentType: 'application/json',
      status: 500,
    });
  });
  await page.goto('/search?q=e2e-error-target&tab=people');

  await expect(page.getByRole('alert')).toContainText('검색 결과를 불러오지 못했어요');
  const previousCount = peopleRequestCount;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect.poll(() => peopleRequestCount).toBeGreaterThan(previousCount);
});
