import { resetE2EDatabase } from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('selectProfile response carries selectedProfile and recreates the active Relay environment', async ({
  page,
}) => {
  const graphQLRequests = collectGraphQLRequests(page);

  await page.goto('/login');
  await page.waitForURL('**/home');

  await createProfileFromSwitcher(page, 'alpha');
  await expect(page.getByText('프로필을 만들어 시작하세요')).toBeHidden();
  await expect(page.getByText('홈', { exact: true }).last()).toBeVisible();
  await page.goto('/compose');
  await expect(page.getByText('글쓰기', { exact: true }).last()).toBeVisible();
  await expect(composerProfileHandle(page, 'alpha')).toBeVisible();
  await expect(sidebarProfileHandle(page, 'alpha')).toBeVisible();

  await createProfileFromSwitcher(page, 'beta');
  await expect(sidebarProfileHandle(page, 'beta')).toBeVisible();
  await page.waitForLoadState('networkidle');

  graphQLRequests.clear();

  const responseBody = await selectProfileFromSwitcher(page, 'alpha');

  expect(responseBody.data?.selectProfile?.profile?.handle).toBe('alpha');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page).toHaveURL(/\/compose$/);
  await expect(composerProfileHandle(page, 'alpha')).toBeVisible();

  expect(graphQLRequests.operationNames).toContain('ProfileSwitcherSelectProfileMutation');
  expect(graphQLRequests.operationNames).toContain('SessionProviderQuery');
  expect(graphQLRequests.operationNames).toContain('UniversalShellQuery');
});

test('profile route action follows Profile.viewerState after switching', async ({ page }) => {
  const graphQLRequests = collectGraphQLRequests(page);

  await page.goto('/login');
  await page.waitForURL('**/home');

  await createProfileFromSwitcher(page, 'gamma');
  await createProfileFromSwitcher(page, 'delta');
  await expect(sidebarProfileHandle(page, 'delta')).toBeVisible();

  await page.goto('/@gamma');
  await expect(page.getByRole('button', { name: '팔로우' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  graphQLRequests.clear();

  const responseBody = await selectProfileFromSwitcher(page, 'gamma');

  expect(responseBody.data?.selectProfile?.profile?.handle).toBe('gamma');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '팔로우' })).toBeHidden();
  await expect(page.getByText('@gamma', { exact: true }).last()).toBeVisible();

  expect(graphQLRequests.operationNames).toContain('ProfileSwitcherSelectProfileMutation');
  expect(graphQLRequests.operationNames).toContain('ProfileLayoutQuery');
});

test('home route active profile query refetches after switching profiles', async ({ page }) => {
  const graphQLRequests = collectGraphQLRequests(page);
  const betaPostBody = 'beta profile timeline post';

  await page.goto('/login');
  await page.waitForURL('**/home');

  await createProfileFromSwitcher(page, 'alphahome');
  await createProfileFromSwitcher(page, 'betahome');
  await expect(sidebarProfileHandle(page, 'betahome')).toBeVisible();

  await createPost(page, betaPostBody);
  await page.goto('/home');
  await expect(page.getByText(betaPostBody)).toBeVisible();
  await page.waitForLoadState('networkidle');
  graphQLRequests.clear();

  const homeQueryResponse = waitForGraphQLOperation(page, 'HomePageQuery');

  const responseBody = await selectProfileFromSwitcher(page, 'alphahome');

  expect(responseBody.data?.selectProfile?.profile?.handle).toBe('alphahome');
  const homeQueryBody = (await (await homeQueryResponse).json()) as {
    data?: { homeTimeline?: { edges?: unknown[] | null } | null };
  };
  expect(homeQueryBody.data?.homeTimeline?.edges).toEqual([]);

  await page.waitForLoadState('networkidle');

  expect(graphQLRequests.operationNames).toContain('ProfileSwitcherSelectProfileMutation');
  expect(graphQLRequests.operationNames).toContain('HomePageQuery');
});

test('home onboarding stays hidden while the home active profile query errors', async ({
  page,
}) => {
  const graphQLRequests = collectGraphQLRequests(page);

  await page.goto('/login');
  await page.waitForURL('**/home');

  await createProfileFromSwitcher(page, 'errorhome');
  await expect(sidebarProfileHandle(page, 'errorhome')).toBeVisible();
  await page.waitForLoadState('networkidle');
  graphQLRequests.clear();

  await failGraphQLOperation(page, 'HomePageQuery');
  await page.reload();

  await expect(page.getByText('사용할 프로필을 선택해주세요')).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('홈을 불러오지 못했어요');
  expect(graphQLRequests.operationNames).toContain('HomePageQuery');
});

function collectGraphQLRequests(page: Page) {
  const operationNames: string[] = [];

  page.on('request', (request) => {
    if (request.method() !== 'POST' || !isGraphQLResponse(request.url())) {
      return;
    }

    const operation = readGraphQLOperation(request.postData());
    if (operation?.operationName) {
      operationNames.push(operation.operationName);
    }
  });

  return {
    operationNames,
    clear: () => {
      operationNames.length = 0;
    },
  };
}

async function createProfileFromSwitcher(page: Page, handle: string) {
  let createProfilePostData: string | null = null;
  const createProfileResponse = page.waitForResponse(async (response) => {
    if (!isGraphQLResponse(response.url())) {
      return false;
    }

    createProfilePostData = response.request().postData();
    const operation = readGraphQLOperation(createProfilePostData);

    return operation?.operationName === 'ProfileSwitcherCreateProfileMutation';
  });

  await openProfileSwitcher(page);
  await page.getByRole('menuitem', { name: '새 프로필 추가' }).click();
  const creationForm = page.getByRole('form', { name: '새 프로필 만들기' });

  await creationForm.getByPlaceholder('새 프로필 핸들').fill(handle);
  await creationForm.getByRole('button', { name: '만들기', exact: true }).click();

  const responseBody = (await (await createProfileResponse).json()) as {
    data?: {
      createProfile?: {
        account?: {
          profiles?: Array<{ handle?: string | null } | null> | null;
        } | null;
      } | null;
    };
    errors?: Array<{
      extensions?: Record<string, unknown> | null;
      message?: string | null;
      path?: Array<string | number> | null;
    }> | null;
  };

  expect(
    responseBody.errors,
    JSON.stringify({ errors: responseBody.errors, request: createProfilePostData }, null, 2),
  ).toBeUndefined();
  expect(
    responseBody.data?.createProfile?.account?.profiles?.some(
      (profile) => profile?.handle === handle,
    ),
  ).toBe(true);
  await expect(sidebarProfileHandle(page, handle)).toBeVisible();
}

async function openProfileSwitcher(page: Page) {
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.getByRole('button', { name: '프로필 목록' }).first().click();
  await expect(page.getByRole('menu', { name: '프로필 전환' })).toBeVisible();
}

async function selectProfileFromSwitcher(page: Page, handle: string) {
  const selectProfileResponse = waitForGraphQLOperation(
    page,
    'ProfileSwitcherSelectProfileMutation',
  );

  await openProfileSwitcher(page);
  await page
    .getByRole('menuitemradio')
    .filter({ hasText: `@${handle}` })
    .click();

  const responseBody = (await (await selectProfileResponse).json()) as {
    data?: {
      selectProfile?: {
        profile?: {
          handle?: string | null;
        } | null;
        session?: {
          selectedProfile?: {
            id?: string | null;
          } | null;
        } | null;
      } | null;
    };
  };
  return responseBody;
}

async function createPost(page: Page, body: string) {
  const createPostResponse = waitForGraphQLOperation(page, 'PostComposerCreatePostMutation');

  await page.goto('/compose');
  const composer = page.getByLabel('새 게시글 작성').first();

  await composer.getByRole('textbox', { name: '게시글 본문' }).fill(body);
  await composer.getByRole('button', { name: '게시', exact: true }).click();
  await createPostResponse;
}

async function failGraphQLOperation(page: Page, operationName: string) {
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());

    if (operation?.operationName !== operationName) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ errors: [{ message: `${operationName} failed for test` }] }),
    });
  });
}

function composerProfileHandle(page: Page, handle: string) {
  return page.getByLabel('새 게시글 작성').first().getByText(`@${handle}`);
}

function sidebarProfileHandle(page: Page, handle: string) {
  return page.getByLabel('활성 프로필 핸들').filter({ hasText: `@${handle}` });
}

function waitForGraphQLOperation(page: Page, operationName: string) {
  return page.waitForResponse(async (response) => {
    if (!isGraphQLResponse(response.url())) {
      return false;
    }

    const operation = readGraphQLOperation(response.request().postData());

    return operation?.operationName === operationName;
  });
}

function isGraphQLResponse(url: string) {
  return new URL(url).pathname === '/graphql';
}
