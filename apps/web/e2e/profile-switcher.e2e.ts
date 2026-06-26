import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const currentSessionQueryOperations = new Set([
  'ComposePageQuery',
  'ProtectedLayoutQuery',
  'TabsLayoutQuery',
]);

test('profile selection updates open shell and compose from mutation payload', async ({ page }) => {
  const graphQLOperations = collectGraphQLOperations(page);

  await page.goto('/login');
  await page.waitForURL('**/home');

  await createProfileFromSwitcher(page, 'alpha');
  await page.goto('/compose');
  await expect(page.getByRole('heading', { name: '글쓰기' })).toBeVisible();
  await expect(composerProfileHandle(page, 'alpha')).toBeVisible();
  await expect(sidebarProfileHandle(page, 'alpha')).toBeVisible();

  await createProfileFromSwitcher(page, 'beta');
  await expect(composerProfileHandle(page, 'beta')).toBeVisible();
  await expect(sidebarProfileHandle(page, 'beta')).toBeVisible();
  await page.waitForLoadState('networkidle');

  graphQLOperations.length = 0;

  const selectProfileResponse = page.waitForResponse(async (response) => {
    if (!isGraphQLResponse(response.url())) {
      return false;
    }

    const operation = readGraphQLOperation(response.request().postData());

    return operation?.operationName === 'ProfileSwitcherSelectProfileMutation';
  });

  await openProfileSwitcher(page);
  await page.getByRole('menuitemradio').filter({ hasText: '@alpha' }).click();

  const responseBody = (await (await selectProfileResponse).json()) as {
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

  expect(responseBody.data?.selectProfile?.session?.selectedProfile?.handle).toBe('alpha');
  await expect(composerProfileHandle(page, 'alpha')).toBeVisible();
  await expect(sidebarProfileHandle(page, 'alpha')).toBeVisible();

  await page.waitForTimeout(500);

  expect(graphQLOperations).toContain('ProfileSwitcherSelectProfileMutation');
  expect(
    graphQLOperations.filter((operation) => currentSessionQueryOperations.has(operation)),
  ).toEqual([]);
});

function collectGraphQLOperations(page: Page) {
  const operations: string[] = [];

  page.on('request', (request) => {
    if (request.method() !== 'POST' || !isGraphQLResponse(request.url())) {
      return;
    }

    const operation = readGraphQLOperation(request.postData());
    if (operation?.operationName) {
      operations.push(operation.operationName);
    }
  });

  return operations;
}

async function createProfileFromSwitcher(page: Page, handle: string) {
  await openProfileSwitcher(page);
  await page.getByRole('menuitem', { name: '새 프로필 추가' }).click();
  const creationForm = page.getByRole('form', { name: '새 프로필 만들기' });

  await creationForm.getByPlaceholder('새 프로필 핸들').fill(handle);
  await creationForm.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page.getByText(`@${handle}`).first()).toBeVisible();
}

async function openProfileSwitcher(page: Page) {
  await page.locator('button[aria-label="프로필 목록"]:visible').first().click();
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
    return JSON.parse(postData) as { operationName?: string | null };
  } catch {
    return null;
  }
}
