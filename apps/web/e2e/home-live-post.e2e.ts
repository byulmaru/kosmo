import { devices } from '@playwright/test';
import {
  createE2EFollow,
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, toGlobalId, waitForGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

type HomePostNode = Readonly<Record<string, unknown>> & { id: string };

type HomePageResponse = {
  data?: {
    homeTimeline?: {
      edges?: Array<{ node?: HomePostNode | null } | null> | null;
    } | null;
  };
};

type HomePostSseRequest = {
  operationName?: string | null;
  extensions?: Record<string, unknown> | null;
};

type HomePostSseTestController = {
  ready: Promise<HomePostSseRequest>;
  enqueue: (frame: string) => void;
  finish: () => void;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function installHomePostEventRoute(page: Page, postId: string, refreshMarkerId: string) {
  // Hold only this subscription's body; the 200 SSE response headers arrive immediately.
  await page.addInitScript((operationName) => {
    const nativeFetch = window.fetch.bind(window);
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let resolveReady!: (request: HomePostSseRequest) => void;
    const ready = new Promise<HomePostSseRequest>((resolve) => {
      resolveReady = resolve;
    });
    const testController: HomePostSseTestController = {
      ready,
      enqueue(frame) {
        if (!streamController) {
          throw new Error('Home Post SSE stream is not ready.');
        }
        streamController.enqueue(new TextEncoder().encode(frame));
      },
      finish() {
        if (!streamController) {
          return;
        }
        streamController.enqueue(new TextEncoder().encode('event: complete\ndata: \n\n'));
        streamController.close();
        streamController = null;
      },
    };
    Object.assign(window, { __homePostSseTest: testController });

    window.fetch = async (input, init) => {
      const inputUrl =
        input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      const url = new URL(inputUrl, window.location.href);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      const body = init?.body;

      if (
        url.pathname === '/graphql' &&
        method === 'POST' &&
        headers.get('accept')?.includes('text/event-stream') &&
        typeof body === 'string'
      ) {
        let request: HomePostSseRequest | null = null;
        try {
          request = JSON.parse(body) as HomePostSseRequest;
        } catch {
          request = null;
        }

        if (request?.operationName === operationName) {
          const response = new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
            { headers: { 'content-type': 'text/event-stream' }, status: 200 },
          );
          resolveReady({ operationName: request.operationName, extensions: request.extensions });
          return response;
        }
      }

      return nativeFetch(input, init);
    };
  }, 'HomeTimelinePostAddedSubscription');

  const eventPostReady = deferred<HomePostNode | null>();
  let homePageQueryCount = 0;
  let homePageQueryInFlightCount = 0;
  let capturedEventPost: HomePostNode | null = null;
  let allowEventPostInCanonicalReads = false;

  await page.route('**/graphql', async (route) => {
    const request = route.request();
    const operation = readGraphQLOperation(request.postData());

    if (operation?.operationName === 'HomePageQuery') {
      homePageQueryCount += 1;
      homePageQueryInFlightCount += 1;
      try {
        const response = await route.fetch();
        const body = (await response.json()) as HomePageResponse;
        const edges = body.data?.homeTimeline?.edges;
        const eventEdge = edges?.find((edge) => edge?.node?.id === postId);

        if (!capturedEventPost) {
          capturedEventPost = eventEdge?.node ?? null;
          eventPostReady.resolve(capturedEventPost);
        }

        // Keep the fixture Post out of canonical responses until the stream assertion is complete.
        if (edges) {
          const withheldPostIds = new Set<string>();
          if (!allowEventPostInCanonicalReads) {
            withheldPostIds.add(postId);
          }
          if (homePageQueryCount === 1) {
            withheldPostIds.add(refreshMarkerId);
          }
          body.data!.homeTimeline!.edges = edges.filter(
            (edge) => !withheldPostIds.has(edge?.node?.id ?? ''),
          );
        }

        await route.fulfill({ response, body: JSON.stringify(body) });
      } finally {
        homePageQueryInFlightCount -= 1;
      }
      return;
    }

    await route.continue();
  });

  return {
    allowEventPostInCanonicalReads() {
      allowEventPostInCanonicalReads = true;
    },
    async close() {
      await page
        .evaluate(() => {
          const controller = (window as Window & { __homePostSseTest?: HomePostSseTestController })
            .__homePostSseTest;
          controller?.finish();
        })
        .catch(() => undefined);
      await page.unrouteAll({ behavior: 'wait' });
    },
    eventPostReady: eventPostReady.promise,
    homePageQueryCount: () => homePageQueryCount,
    async sendPostFrames() {
      if (!capturedEventPost) {
        throw new Error('Home Timeline Post payload was not captured from HomePageQuery.');
      }

      const nextEvent = `event: next\ndata: ${JSON.stringify({
        data: { homeTimelinePostAdded: capturedEventPost },
      })}\n\n`;
      await page.evaluate(
        (frames) => {
          const controller = (window as Window & { __homePostSseTest?: HomePostSseTestController })
            .__homePostSseTest;
          if (!controller) {
            throw new Error('Home Post SSE test controller was not installed.');
          }
          for (const frame of frames) {
            controller.enqueue(frame);
          }
          controller.finish();
        },
        [nextEvent, nextEvent],
      );
    },
    async waitForInitialBackgroundRead(refreshMarkerBody: string) {
      await page.evaluate(async () => {
        const controller = (window as Window & { __homePostSseTest?: HomePostSseTestController })
          .__homePostSseTest;
        if (!controller) {
          throw new Error('Home Post SSE test controller was not installed.');
        }
        await controller.ready;
      });
      await expect(page.getByRole('article').filter({ hasText: refreshMarkerBody })).toHaveCount(1);
      await expect.poll(() => homePageQueryInFlightCount).toBe(0);
    },
    async waitForSubscriptionRequest() {
      return await page.evaluate(async () => {
        const controller = (window as Window & { __homePostSseTest?: HomePostSseTestController })
          .__homePostSseTest;
        if (!controller) {
          throw new Error('Home Post SSE test controller was not installed.');
        }
        return await controller.ready;
      });
    },
  };
}

async function createHomeFixture(width: number) {
  const viewer = await createE2ESession({ handle: `e2e-home-live-viewer-${width}` });
  const author = await createE2EProfile({
    displayName: `E2E Home Live Author ${width}`,
    handle: `e2e-home-live-author-${width}`,
  });
  await createE2EFollow({
    followerProfileId: viewer.profile!.id,
    followeeProfileId: author.id,
  });

  const anchorBody = `E2E Home live anchor ${'longer reading content '.repeat(24)}`.trim();
  const oldestBody = `E2E Home live older 0 ${'older post '.repeat(24)}`.trim();
  for (let index = 0; index < 20; index += 1) {
    await createE2EPost({
      body:
        index === 10
          ? anchorBody
          : `E2E Home live older ${index} ${'older post '.repeat(24)}`.trim(),
      profileId: author.id,
    });
  }

  const refreshMarkerBody = `E2E Home live refresh marker ${width}`;
  const refreshMarker = await createE2EPost({ body: refreshMarkerBody, profileId: author.id });
  const eventPostBody = `E2E Home live event ${width}`;
  const eventPost = await createE2EPost({ body: eventPostBody, profileId: author.id });
  return {
    anchorBody,
    eventPostBody,
    eventPostId: toGlobalId('Post', eventPost.id),
    oldestBody,
    refreshMarkerBody,
    refreshMarkerId: toGlobalId('Post', refreshMarker.id),
    viewer,
  };
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

for (const width of [390, 1440]) {
  test.describe(`Home stream 새 게시글 ${width}px`, () => {
    test.use({
      viewport: { width, height: 844 },
      isMobile: width === 390,
      hasTouch: width === 390,
      ...(width === 390 ? { userAgent: devices['iPhone 13'].userAgent } : {}),
    });

    test('상단에서 실제 Post 이벤트를 받으면 새 글을 표시하고 중복 삽입하지 않는다', async ({
      context,
      page,
    }) => {
      test.setTimeout(90_000);
      const fixture = await createHomeFixture(width);
      await setE2ESessionCookie(context, fixture.viewer.token);
      const eventRoute = await installHomePostEventRoute(
        page,
        fixture.eventPostId,
        fixture.refreshMarkerId,
      );

      try {
        await page.goto('/home');
        expect(await eventRoute.eventPostReady).not.toBeNull();
        const subscription = await eventRoute.waitForSubscriptionRequest();
        expect(subscription?.operationName).toBe('HomeTimelinePostAddedSubscription');
        expect(subscription?.extensions?.selectedProfileId).toBe(
          toGlobalId('Profile', fixture.viewer.profile!.id),
        );
        await eventRoute.waitForInitialBackgroundRead(fixture.refreshMarkerBody);
        const eventCard = page.getByRole('article').filter({ hasText: fixture.eventPostBody });
        await expect(eventCard).toHaveCount(0);

        const homeQueryCountBeforeEvent = eventRoute.homePageQueryCount();
        await eventRoute.sendPostFrames();

        await expect(eventCard).toHaveCount(1);
        await expect(page.getByRole('article').first()).toContainText(fixture.eventPostBody);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        expect(eventRoute.homePageQueryCount()).toBe(homeQueryCountBeforeEvent);

        const nextPageResponse = waitForGraphQLOperation(page, 'PostListHomeNextPageQuery');
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const response = await nextPageResponse;
        expect(response.ok()).toBe(true);
        expect((await response.json()).errors).toBeUndefined();
        await expect(page.getByText(fixture.oldestBody, { exact: true })).toBeVisible();
        expect(eventRoute.homePageQueryCount()).toBe(homeQueryCountBeforeEvent);
      } finally {
        await eventRoute.close();
      }
    });

    test('아래에서 Post 이벤트를 받으면 읽던 위치를 유지하고 새 글 보기로 이동한다', async ({
      context,
      page,
    }) => {
      test.setTimeout(90_000);
      const fixture = await createHomeFixture(width);
      await setE2ESessionCookie(context, fixture.viewer.token);
      const eventRoute = await installHomePostEventRoute(
        page,
        fixture.eventPostId,
        fixture.refreshMarkerId,
      );

      try {
        await page.goto('/home');
        const subscription = await eventRoute.waitForSubscriptionRequest();
        expect(subscription?.operationName).toBe('HomeTimelinePostAddedSubscription');
        expect(subscription?.extensions?.selectedProfileId).toBe(
          toGlobalId('Profile', fixture.viewer.profile!.id),
        );
        expect(await eventRoute.eventPostReady).not.toBeNull();
        await eventRoute.waitForInitialBackgroundRead(fixture.refreshMarkerBody);

        const anchor = page.getByRole('article').filter({ hasText: fixture.anchorBody });
        await anchor.scrollIntoViewIfNeeded();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        const eventCard = page.getByRole('article').filter({ hasText: fixture.eventPostBody });
        await expect(eventCard).toHaveCount(0);
        const anchorTop = await anchor.evaluate((element) => element.getBoundingClientRect().top);
        const homeQueryCountBeforeEvent = eventRoute.homePageQueryCount();
        await eventRoute.sendPostFrames();

        await expect(eventCard).toHaveCount(1);
        await expect
          .poll(async () => {
            const nextTop = await anchor.evaluate((element) => element.getBoundingClientRect().top);
            return Math.abs(nextTop - anchorTop);
          })
          .toBeLessThanOrEqual(3);
        await expect(page.getByRole('button', { name: '새 글 보기' })).toBeVisible();
        expect(eventRoute.homePageQueryCount()).toBe(homeQueryCountBeforeEvent);

        // Let an independently queued lifecycle read see the real Post after the stream proof.
        eventRoute.allowEventPostInCanonicalReads();
        await page.getByRole('button', { name: '새 글 보기' }).click();
        await expect(eventCard).toHaveCount(1);
        await expect(page.getByRole('article').first()).toContainText(fixture.eventPostBody);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      } finally {
        await eventRoute.close();
      }
    });
  });
}
