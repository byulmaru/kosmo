import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

test('profile selection updates compose through its route currentSession query', async ({
  page,
}) => {
  const graphQLRequests = collectGraphQLRequests(page);

  await page.goto('/login');
  await page.waitForURL('**/home');

  await createProfileFromSwitcher(page, 'alpha');
  await expect(page.getByRole('heading', { name: '프로필을 만들어 시작하세요' })).toBeHidden();
  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible();
  await page.goto('/compose');
  await expect(page.getByRole('heading', { name: '글쓰기' })).toBeVisible();
  await expect(composerProfileHandle(page, 'alpha')).toBeVisible();
  await expect(sidebarProfileHandle(page, 'alpha')).toBeVisible();

  await createProfileFromSwitcher(page, 'beta');
  await expect(composerProfileHandle(page, 'beta')).toBeVisible();
  await expect(sidebarProfileHandle(page, 'beta')).toBeVisible();
  await page.waitForLoadState('networkidle');

  graphQLRequests.clear();

  const responseBody = await selectProfileFromSwitcher(page, 'alpha');

  expect(responseBody.data?.selectProfile?.session?.selectedProfile?.handle).toBe('alpha');
  await expect(composerProfileHandle(page, 'alpha')).toBeVisible();
  await expect(sidebarProfileHandle(page, 'alpha')).toBeVisible();

  await page.waitForLoadState('networkidle');

  expect(graphQLRequests.operationNames).toContain('ProfileSwitcherSelectProfileMutation');
  expect(graphQLRequests.currentSessionSelectedProfileOperations).toContain('ComposePageQuery');
});

test('profile route action follows Profile.viewerState after switching', async ({ page }) => {
  const graphQLRequests = collectGraphQLRequests(page);

  await page.goto('/login');
  await page.waitForURL('**/home');

  await createProfileFromSwitcher(page, 'gamma');
  await createProfileFromSwitcher(page, 'delta');
  await expect(sidebarProfileHandle(page, 'delta')).toBeVisible();

  await page.goto('/@gamma');
  await expect(page.getByRole('main').getByRole('button', { name: '팔로우' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  graphQLRequests.clear();

  const responseBody = await selectProfileFromSwitcher(page, 'gamma');

  expect(responseBody.data?.selectProfile?.session?.selectedProfile?.handle).toBe('gamma');
  await expect(sidebarProfileHandle(page, 'gamma')).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: '팔로우' })).toBeHidden();

  await page.waitForLoadState('networkidle');

  expect(graphQLRequests.operationNames).toContain('ProfileSwitcherSelectProfileMutation');
  expect(graphQLRequests.operationNames).toContain('ProfileLayoutQuery');
  expect(graphQLRequests.currentSessionSelectedProfileOperations).toContain('TabsLayoutQuery');
  expect(graphQLRequests.currentSessionSelectedProfileOperations).not.toContain(
    'ProfileLayoutQuery',
  );
});

test('home timeline updates after the home route active profile query refetches', async ({
  page,
}) => {
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

  const delayedHomeQuery = await delayNextGraphQLOperation(page, 'HomePageQuery');

  const responseBody = await selectProfileFromSwitcher(page, 'alphahome');

  expect(responseBody.data?.selectProfile?.session?.selectedProfile?.handle).toBe('alphahome');
  await expect(sidebarProfileHandle(page, 'alphahome')).toBeVisible();
  await delayedHomeQuery.waitForRequest();

  await expect(page.getByText(betaPostBody)).toBeHidden();
  await expect(page.getByText('아직 게시글이 없어요')).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: '게시글 목록을 불러오는 중입니다.' }),
  ).toBeAttached();

  delayedHomeQuery.release();

  await expect(page.getByText('아직 게시글이 없어요')).toBeVisible();
  await expect(page.getByText(betaPostBody)).toBeHidden();

  await page.waitForLoadState('networkidle');

  expect(graphQLRequests.operationNames).toContain('ProfileSwitcherSelectProfileMutation');
  expect(graphQLRequests.currentSessionSelectedProfileOperations).toContain('HomePageQuery');
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

  await expect(page.getByRole('heading', { name: '사용할 프로필을 선택해주세요' })).toBeHidden();
  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible();
  expect(graphQLRequests.currentSessionSelectedProfileOperations).toContain('HomePageQuery');
});

function collectGraphQLRequests(page: Page) {
  const operationNames: string[] = [];
  const currentSessionSelectedProfileOperations: string[] = [];

  page.on('request', (request) => {
    if (request.method() !== 'POST' || !isGraphQLResponse(request.url())) {
      return;
    }

    const operation = readGraphQLOperation(request.postData());
    if (operation?.operationName) {
      operationNames.push(operation.operationName);
    }

    if (operation?.query && readsCurrentSessionSelectedProfile(operation.query)) {
      currentSessionSelectedProfileOperations.push(operation.operationName ?? '<anonymous>');
    }
  });

  return {
    operationNames,
    currentSessionSelectedProfileOperations,
    clear: () => {
      operationNames.length = 0;
      currentSessionSelectedProfileOperations.length = 0;
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
  await expect(page.getByText(`@${handle}`).first()).toBeVisible();
}

async function openProfileSwitcher(page: Page) {
  await page.locator('button[aria-label="프로필 목록"]:visible').first().click();
}

async function selectProfileFromSwitcher(page: Page, handle: string) {
  const selectProfileResponse = page.waitForResponse(async (response) => {
    if (!isGraphQLResponse(response.url())) {
      return false;
    }

    const operation = readGraphQLOperation(response.request().postData());

    return operation?.operationName === 'ProfileSwitcherSelectProfileMutation';
  });

  await openProfileSwitcher(page);
  await page
    .getByRole('menuitemradio')
    .filter({ hasText: `@${handle}` })
    .click();

  return (await (await selectProfileResponse).json()) as {
    data?: {
      selectProfile?: {
        session?: {
          selectedProfile?: {
            handle?: string | null;
          } | null;
        } | null;
      } | null;
    };
  };
}

async function createPost(page: Page, body: string) {
  const createPostResponse = page.waitForResponse(async (response) => {
    if (!isGraphQLResponse(response.url())) {
      return false;
    }

    const operation = readGraphQLOperation(response.request().postData());

    return operation?.operationName === 'PostComposerCreatePost';
  });

  await page.goto('/compose');
  const composer = page.getByRole('main').locator('form[aria-label="새 게시글 작성"]');

  await composer.locator('[aria-label="게시글 본문"]').fill(body);
  await composer.getByRole('button', { name: '게시', exact: true }).click();
  await createPostResponse;
}

async function delayNextGraphQLOperation(page: Page, operationName: string) {
  let release!: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve;
  });

  let resolveRequestSeen!: () => void;
  const requestSeenPromise = new Promise<void>((resolve) => {
    resolveRequestSeen = resolve;
  });

  let matched = false;
  const handler = async (route: Route) => {
    const operation = readGraphQLOperation(route.request().postData());

    if (matched || operation?.operationName !== operationName) {
      await route.fallback();
      return;
    }

    matched = true;
    const response = await route.fetch();
    resolveRequestSeen();
    await releasePromise;
    await route.fulfill({ response });
    await page.unroute('**/graphql', handler);
  };

  await page.route('**/graphql', handler);

  return {
    waitForRequest: () => requestSeenPromise,
    release,
  };
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
  return page
    .getByRole('main')
    .locator('form[aria-label="새 게시글 작성"]')
    .getByText(`@${handle}`);
}

function sidebarProfileHandle(page: Page, handle: string) {
  return page.locator('section[aria-label="활성 프로필"]:visible').first().getByText(`@${handle}`);
}

function isGraphQLResponse(url: string) {
  return new URL(url).pathname === '/graphql';
}

function readGraphQLOperation(postData: string | null) {
  if (!postData) {
    return null;
  }

  try {
    return JSON.parse(postData) as { operationName?: string | null; query?: string | null };
  } catch {
    return null;
  }
}

function readsCurrentSessionSelectedProfile(query: string) {
  return /currentSession(?:\s*\([^)]*\))?\s*{[^}]*selectedProfile/s.test(query);
}
