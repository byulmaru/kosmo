import {
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation, toGlobalId } from './graphql';
import type { Page } from '@playwright/test';

const historyStorageKey = 'kosmo-e2e-route-history';
const shellQueries = ['UniversalShellQuery', 'ProfileLayoutQuery'] as const;

type RouteCase = {
  path: string;
  verify: (page: Page) => Promise<void>;
};

type HistoryEntry = {
  method: 'document' | 'pushState' | 'replaceState';
  path: string;
};

async function installHistoryRecorder(page: Page) {
  await page.addInitScript((storageKey: string) => {
    const record = (method: HistoryEntry['method']) => {
      const entries = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as HistoryEntry[];
      entries.push({
        method,
        path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      });
      sessionStorage.setItem(storageKey, JSON.stringify(entries));
    };

    record('document');

    for (const method of ['pushState', 'replaceState'] as const) {
      const original = window.history[method];
      window.history[method] = function (...args) {
        const result = original.apply(this, args);
        record(method);
        return result;
      };
    }
  }, historyStorageKey);
}

async function expectHistoryAt(page: Page, expectedPath: string) {
  const entries = await page.evaluate((storageKey) => {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as HistoryEntry[];
  }, historyStorageKey);

  expect(entries.length, JSON.stringify(entries)).toBeGreaterThan(0);
  expect(entries[0], JSON.stringify(entries)).toEqual({ method: 'document', path: expectedPath });
  expect(
    entries.every(({ path }) => path === expectedPath),
    JSON.stringify(entries),
  ).toBe(true);
}

async function clearHistoryRecorder(page: Page) {
  await page.evaluate((storageKey) => sessionStorage.setItem(storageKey, '[]'), historyStorageKey);
}

async function createRoutes(): Promise<RouteCase[]> {
  const profile = await createE2EProfile({
    displayName: '새로고침 대상 프로필',
    handle: 'e2e-route-refresh-profile',
  });
  const post = await createE2EPost({
    body: '새로고침 URL 회귀 게시물',
    profileId: profile.id,
  });
  const postPath = `/@${profile.handle}/${toGlobalId('Post', post.id)}`;

  return [
    {
      path: '/home',
      verify: async (page) => {
        await expect(page.getByText('홈', { exact: true }).last()).toBeVisible();
      },
    },
    {
      path: '/search',
      verify: async (page) => {
        await expect(page.getByRole('textbox', { name: '검색어' })).toBeVisible();
      },
    },
    {
      path: '/notifications',
      verify: async (page) => {
        await expect(page.getByRole('heading', { name: '알림' })).toBeVisible();
      },
    },
    {
      path: '/bookmarks',
      verify: async (page) => {
        await expect(page.getByRole('heading', { name: '북마크' })).toBeVisible();
      },
    },
    {
      path: '/settings',
      verify: async (page) => {
        await expect(page.getByRole('heading', { name: '설정' }).last()).toBeVisible();
      },
    },
    {
      path: '/settings/theme',
      verify: async (page) => {
        await expect(page.getByRole('heading', { name: '테마', exact: true })).toBeVisible();
      },
    },
    {
      path: `/@${profile.handle}`,
      verify: async (page) => {
        await expect(
          page.getByRole('heading', { name: profile.displayName, exact: true }),
        ).toBeVisible();
      },
    },
    {
      path: `/@${profile.handle}/following`,
      verify: async (page) => {
        await expect(
          page.getByRole('heading', { name: `${profile.displayName}님의 팔로잉` }),
        ).toBeVisible();
      },
    },
    {
      path: postPath,
      verify: async (page) => {
        await expect(page.getByText('새로고침 URL 회귀 게시물', { exact: true })).toBeVisible();
      },
    },
    {
      path: `${postPath}/reactions`,
      verify: async (page) => {
        await expect(page.getByRole('heading', { name: '반응한 사람' })).toBeVisible();
      },
    },
    {
      path: '/privacy',
      verify: async (page) => {
        await expect(page.getByRole('heading', { name: 'Kosmo 개인정보 처리방침' })).toBeVisible();
      },
    },
  ];
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

for (const delayed of [false, true]) {
  test(`직접 접근과 새로고침은 ${delayed ? '지연된' : '정상'} Relay 응답에서도 URL 이력을 보존한다`, async ({
    context,
    page,
  }) => {
    test.setTimeout(180_000);

    const viewer = await createE2ESession({ handle: 'e2e-route-refresh-viewer' });
    await setE2ESessionCookie(context, viewer.token);
    await page.setViewportSize({ height: 900, width: 1440 });
    await installHistoryRecorder(page);

    if (delayed) {
      await page.route('**/graphql', async (route) => {
        const body = route.request().postData();
        if (shellQueries.some((operationName) => isGraphQLOperation(body, operationName))) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        await route.continue();
      });
    }

    const routes = await createRoutes();
    let hasLoadedRoute = false;

    for (const route of routes) {
      if (hasLoadedRoute) {
        await clearHistoryRecorder(page);
      }

      await page.goto(route.path);
      hasLoadedRoute = true;
      await route.verify(page);
      await expect
        .poll(() => {
          const { hash, pathname, search } = new URL(page.url());
          return `${pathname}${search}${hash}`;
        })
        .toBe(route.path);
      await expectHistoryAt(page, route.path);

      await clearHistoryRecorder(page);
      await page.reload();
      await route.verify(page);
      await expect
        .poll(() => {
          const { hash, pathname, search } = new URL(page.url());
          return `${pathname}${search}${hash}`;
        })
        .toBe(route.path);
      await expectHistoryAt(page, route.path);
    }
  });
}

test('존재하지 않는 route는 직접 접근과 새로고침에서 요청한 URL을 유지한다', async ({ page }) => {
  const path = '/e2e/route-refresh/unknown/unmatched';
  await installHistoryRecorder(page);
  await page.goto(path);

  await expect(page.getByText('페이지를 찾을 수 없어요', { exact: true })).toBeVisible();
  await expectHistoryAt(page, path);
  await clearHistoryRecorder(page);
  await page.reload();

  await expect(page.getByText('페이지를 찾을 수 없어요', { exact: true })).toBeVisible();
  await expectHistoryAt(page, path);
});
