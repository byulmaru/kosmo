import { Buffer } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
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

type PostHogPayload = {
  batch?: Array<{ event?: string; properties?: { $current_url?: string } }>;
  event?: string;
  properties?: { $current_url?: string };
};

function parsePostHogEvents(
  body: Buffer,
  requestUrl: string,
  contentType: string | undefined,
): PostHogPayload {
  const compression = new URL(requestUrl).searchParams.get('compression');
  if (contentType?.startsWith('application/x-www-form-urlencoded')) {
    const encoded = new URLSearchParams(body.toString('utf8')).get('data');
    if (encoded === null) {
      return {};
    }
    const json =
      compression === 'base64' ? Buffer.from(encoded, 'base64').toString('utf8') : encoded;
    return JSON.parse(json) as PostHogPayload;
  }

  const json =
    body[0] === 0x1f && body[1] === 0x8b
      ? gunzipSync(body).toString('utf8')
      : body.toString('utf8');
  return JSON.parse(json) as PostHogPayload;
}

function getPageviewPath(currentUrl: string | undefined) {
  if (!currentUrl) {
    return '';
  }

  const { hash, pathname, search } = new URL(currentUrl);
  return `${pathname}${search}${hash}`;
}

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
        await expect(page.getByRole('heading', { name: '테마' })).toBeVisible();
      },
    },
    {
      path: `/@${profile.handle}`,
      verify: async (page) => {
        await expect(page.getByText(profile.displayName, { exact: true })).toBeVisible();
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

    // Establish this origin before clearing sessionStorage for the first measured document.
    await page.goto('/');
    const routes = await createRoutes();

    for (const route of routes) {
      await clearHistoryRecorder(page);
      await page.goto(route.path);
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

test('활성 PostHog SDK는 새로고침 중 잘못된 URL의 pageview를 보내지 않는다', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);

  const viewer = await createE2ESession({ handle: 'e2e-route-refresh-analytics' });
  const routes = await createRoutes();
  const validPaths = new Set(routes.map(({ path }) => path));
  await setE2ESessionCookie(context, viewer.token);
  await page.setViewportSize({ height: 900, width: 1440 });
  await installHistoryRecorder(page);

  const pageviews: Array<{ currentUrl?: string }> = [];
  await page.route('**/channel.js', (route) =>
    route.fulfill({
      body: 'globalThis.__KOSMO_CHANNEL__ = "prod";',
      contentType: 'application/javascript',
    }),
  );
  await page.route('https://us.i.posthog.com/**', async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    if (body) {
      try {
        const payload = parsePostHogEvents(body, request.url(), request.headers()['content-type']);
        const events = payload.batch ?? [payload];
        for (const event of events) {
          if (event.event === '$pageview') {
            pageviews.push({ currentUrl: event.properties?.$current_url });
          }
        }
      } catch {
        // The SDK can use a transport encoding the JSON body; only parsed pageviews are counted.
      }
    }

    await route.fulfill({
      body: '{"status":"ok"}',
      contentType: 'application/json',
      headers: {
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-origin': '*',
      },
      status: 200,
    });
  });
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'hostname');
    if (!descriptor?.configurable || !descriptor.get) {
      throw new Error('The isolated PostHog fixture requires an overridable Location hostname.');
    }
    Object.defineProperty(Location.prototype, 'hostname', {
      ...descriptor,
      get: () => 'kosmo-e2e.test',
    });
  });
  await page.route('**/graphql', async (route) => {
    const body = route.request().postData();
    if (shellQueries.some((operationName) => isGraphQLOperation(body, operationName))) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await route.continue();
  });

  let hasLoadedRoute = false;
  for (const route of routes) {
    if (hasLoadedRoute) {
      await clearHistoryRecorder(page);
    }

    const directPageviewStart = pageviews.length;
    await page.goto(route.path);
    hasLoadedRoute = true;
    await route.verify(page);
    await expect
      .poll(() =>
        pageviews
          .slice(directPageviewStart)
          .some(({ currentUrl }) => getPageviewPath(currentUrl) === route.path),
      )
      .toBe(true);
    expect(
      pageviews.every(({ currentUrl }) => validPaths.has(getPageviewPath(currentUrl))),
      JSON.stringify(pageviews),
    ).toBe(true);
    await expectHistoryAt(page, route.path);

    await clearHistoryRecorder(page);
    const reloadPageviewStart = pageviews.length;
    await page.reload();
    await route.verify(page);
    await expect
      .poll(() =>
        pageviews
          .slice(reloadPageviewStart)
          .some(({ currentUrl }) => getPageviewPath(currentUrl) === route.path),
      )
      .toBe(true);
    expect(
      pageviews.every(({ currentUrl }) => validPaths.has(getPageviewPath(currentUrl))),
      JSON.stringify(pageviews),
    ).toBe(true);
    await expectHistoryAt(page, route.path);
  }
});

test('존재하지 않는 route는 직접 접근과 새로고침에서 요청한 URL을 유지한다', async ({ page }) => {
  await installHistoryRecorder(page);
  await page.goto('/e2e-route-refresh-not-found');

  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeVisible();
  await expectHistoryAt(page, '/e2e-route-refresh-not-found');
  await clearHistoryRecorder(page);
  await page.reload();

  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeVisible();
  await expectHistoryAt(page, '/e2e-route-refresh-not-found');
});
