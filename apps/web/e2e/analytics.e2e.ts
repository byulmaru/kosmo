import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  createE2EPost,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { toGlobalId } from './graphql';

const posthogRoute = /https:\/\/(?:us|us-assets)\.i\.posthog\.com\/.*/u;
const prodAnalyticsOrigin = `http://127.0.0.1:${4174 + Number(process.env.KOSMO_TEST_PORT_OFFSET ?? 0)}`;

const replayRemoteConfigBody = JSON.stringify({
  autocapture_opt_out: false,
  hasFeatureFlags: false,
  sessionRecording: {
    minimumDurationMilliseconds: 0,
    sampleRate: 1,
  },
});
const lazyRecorderScriptPath = fileURLToPath(
  new URL('../../app/node_modules/posthog-js/dist/lazy-recorder.js', import.meta.url),
);

type PostHogPayload = {
  event?: unknown;
  properties?: Record<string, unknown>;
};

function readPostHogPayloads(body: Buffer | null): PostHogPayload[] {
  if (!body) {
    return [];
  }

  try {
    const decoded =
      body[0] === 0x1f && body[1] === 0x8b
        ? gunzipSync(body).toString('utf8')
        : body.toString('utf8');
    const formData = new URLSearchParams(decoded).get('data');
    const json = formData ? Buffer.from(formData, 'base64').toString('utf8') : decoded;
    const payload = JSON.parse(json) as unknown;
    if (Array.isArray(payload)) {
      return payload.filter(
        (entry): entry is PostHogPayload => Boolean(entry) && typeof entry === 'object',
      );
    }

    if (
      payload &&
      typeof payload === 'object' &&
      'batch' in payload &&
      Array.isArray(payload.batch)
    ) {
      return payload.batch.filter(
        (entry): entry is PostHogPayload => Boolean(entry) && typeof entry === 'object',
      );
    }

    return payload && typeof payload === 'object' ? [payload] : [];
  } catch {
    return [];
  }
}

type ReplaySnapshot = {
  type: number;
  data: { source?: number; id?: number; text?: string };
};

function readReplaySnapshots(payloads: PostHogPayload[]): ReplaySnapshot[] {
  return payloads
    .filter((payload) => payload.event === '$snapshot')
    .flatMap((payload) => {
      const snapshotData = payload.properties?.$snapshot_data;
      expect(Array.isArray(snapshotData)).toBe(true);
      // The locked SDK sends rrweb arrays and gzips individual snapshot fields.
      return JSON.parse(JSON.stringify(snapshotData), (_key, value: unknown) => {
        if (typeof value === 'string' && value.startsWith('\u001f\u008b')) {
          return JSON.parse(gunzipSync(Buffer.from(value, 'latin1')).toString('utf8')) as unknown;
        }
        return value;
      }) as ReplaySnapshot[];
    });
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('dev channel Web runtime은 analytics 요청 없이 정상 렌더링된다', async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on('request', (request) => {
    if (/posthog|openpanel/u.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });

  await page.goto('/');

  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
  await page.waitForTimeout(200);
  expect(analyticsRequests).toEqual([]);
});
test('prod channel Web runtime은 pageview를 전송하고 private post를 autocapture에서 제외한다', async ({
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Analytics Profile',
    handle: 'e2e-analytics-profile',
  });
  if (!viewer.profile) {
    throw new Error('Analytics E2E requires a Profile');
  }
  const privatePostContentMarker = 'E2E private Post Content marker';
  const privateMedia = [
    {
      altText: 'E2E private first media',
      url: 'https://media.e2e.invalid/private-first.png',
    },
    {
      altText: 'E2E private second media',
      url: 'https://media.e2e.invalid/private-second.png',
    },
  ] as const;
  await createE2EPost({
    body: privatePostContentMarker,
    media: privateMedia,
    profileId: viewer.profile.id,
  });
  const posthogPayloads: PostHogPayload[] = [];
  const recorderLoadRequests: string[] = [];
  await page.setViewportSize({ height: 844, width: 390 });
  await page.route('https://media.e2e.invalid/**', async (route) => {
    await route.fulfill({
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
      contentType: 'image/png',
      status: 200,
    });
  });
  await page.route(posthogRoute, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/config.js')) {
      await route.abort('failed');
      return;
    }
    if (
      request.method() === 'GET' &&
      url.pathname.includes('/array/') &&
      url.pathname.endsWith('/config')
    ) {
      await route.fulfill({
        body: replayRemoteConfigBody,
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/lazy-recorder.js')) {
      recorderLoadRequests.push(request.url());
      await route.abort('failed');
      return;
    }
    if (request.method() === 'POST') {
      posthogPayloads.push(...readPostHogPayloads(request.postDataBuffer()));
      await route.fulfill({ body: '{}', contentType: 'application/json', status: 503 });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({ autocapture_opt_out: false }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto(prodAnalyticsOrigin);
  await expect
    .poll(() => posthogPayloads.some((payload) => payload.event === '$pageview'))
    .toBe(true);
  await expect.poll(() => recorderLoadRequests.length).toBeGreaterThan(0);

  await page.goto(`${prodAnalyticsOrigin}/${viewer.profile.handle}`);
  await expect
    .poll(() =>
      posthogPayloads.some(
        (payload) =>
          payload.event === '$pageview' &&
          payload.properties?.$pathname === `/${viewer.profile.handle}`,
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: `${privateMedia[0].altText} 크게 보기` }).click();
  const viewerDialog = page.getByRole('dialog');
  await expect(viewerDialog).toBeVisible();
  const pageviewIdsBeforeViewerTransition = new Set(
    posthogPayloads
      .filter((payload) => payload.event === '$pageview')
      .map((payload) => payload.properties?.$pageview_id)
      .filter((pageviewId): pageviewId is string => typeof pageviewId === 'string'),
  );
  const nextImage = viewerDialog.getByRole('button', { name: '다음 이미지' });
  const previousAutocaptureCount = posthogPayloads.filter(
    (payload) => payload.event === '$autocapture',
  ).length;
  await nextImage.click();
  await expect(viewerDialog.getByTestId('post-media-viewer-image')).toHaveAccessibleName(
    privateMedia[1].altText,
  );
  await expect(viewerDialog.getByTestId('post-media-viewer-image')).toBeVisible();
  await expect(viewerDialog.getByTestId('post-media-viewer-counter')).toHaveText('2 / 2');
  await expect
    .poll(() => posthogPayloads.filter((payload) => payload.event === '$autocapture').length)
    .toBeGreaterThan(previousAutocaptureCount);
  const autocapturePayloads = posthogPayloads.filter((payload) => payload.event === '$autocapture');
  expect(JSON.stringify(autocapturePayloads)).not.toContain(privatePostContentMarker);
  for (const { altText } of privateMedia) {
    expect(JSON.stringify(autocapturePayloads)).not.toContain(altText);
  }
  const pageviewIdsAfterViewerTransition = new Set(
    posthogPayloads
      .filter((payload) => payload.event === '$pageview')
      .map((payload) => payload.properties?.$pageview_id)
      .filter((pageviewId): pageviewId is string => typeof pageviewId === 'string'),
  );
  expect([...pageviewIdsAfterViewerTransition].sort()).toEqual(
    [...pageviewIdsBeforeViewerTransition].sort(),
  );
  await viewerDialog.getByRole('button', { name: '이미지 뷰어 닫기' }).click();
  await expect(viewerDialog).toBeHidden();
  await page.goto(prodAnalyticsOrigin);
  await page.getByRole('link', { name: '개인정보 처리방침' }).click();
  await expect(page).toHaveURL(`${prodAnalyticsOrigin}/privacy`);
});

test('prod channel Web runtime은 Replay upload 실패에도 입력·textarea·Post Content를 보호하고 Viewer를 유지한다', async ({
  page,
}) => {
  // Observe separate recorder flushes for DOM setup and subsequent input events.
  test.setTimeout(60_000);
  const viewer = await createE2ESession({
    displayName: 'E2E Replay Masking Profile',
    handle: 'e2e-replay-masking-profile',
  });
  if (!viewer.profile) {
    throw new Error('Replay masking E2E requires a Profile');
  }
  const privatePostContentMarker = 'E2E replay private Post Content marker';
  const privateMedia = [
    {
      altText: 'E2E replay private first media',
      url: 'https://media.e2e.invalid/replay-private-first.png',
    },
    {
      altText: 'E2E replay private second media',
      url: 'https://media.e2e.invalid/replay-private-second.png',
    },
  ] as const;
  await createE2EPost({
    body: privatePostContentMarker,
    media: privateMedia,
    profileId: viewer.profile.id,
  });

  const posthogPayloads: PostHogPayload[] = [];
  const recorderLoadRequests: string[] = [];
  let snapshotUploadFailures = 0;
  const lazyRecorderScript = readFileSync(lazyRecorderScriptPath, 'utf8');

  await page.route('https://media.e2e.invalid/**', async (route) => {
    await route.fulfill({
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
      contentType: 'image/png',
      status: 200,
    });
  });
  await page.route(posthogRoute, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/config.js')) {
      await route.abort('failed');
      return;
    }
    if (
      request.method() === 'GET' &&
      url.pathname.includes('/array/') &&
      url.pathname.endsWith('/config')
    ) {
      await route.fulfill({
        body: replayRemoteConfigBody,
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/lazy-recorder.js')) {
      recorderLoadRequests.push(request.url());
      await route.fulfill({
        body: lazyRecorderScript,
        contentType: 'application/javascript',
        status: 200,
      });
      return;
    }
    if (request.method() === 'POST') {
      const payloads = readPostHogPayloads(request.postDataBuffer());
      posthogPayloads.push(...payloads);
      if (url.pathname === '/s/' && payloads.some((payload) => payload.event === '$snapshot')) {
        snapshotUploadFailures += 1;
        await route.fulfill({ body: '{}', contentType: 'application/json', status: 503 });
        return;
      }
    }

    await route.fulfill({ body: '{}', contentType: 'application/json', status: 200 });
  });

  await page.goto(prodAnalyticsOrigin);
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
  await expect.poll(() => recorderLoadRequests.length).toBeGreaterThan(0);

  await page.goto(`${prodAnalyticsOrigin}/${viewer.profile.handle}`);
  await expect
    .poll(() =>
      posthogPayloads.some(
        (payload) =>
          payload.event === '$pageview' &&
          payload.properties?.$pathname === `/${viewer.profile.handle}`,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole('button', { name: `${privateMedia[0].altText} 크게 보기` }),
  ).toBeVisible();

  await expect(page.getByText(privatePostContentMarker, { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const fixture = document.createElement('form');
    fixture.id = 'replay-synthetic-masking-fixture';
    Object.assign(fixture.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      zIndex: '2147483647',
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('aria-label', 'Synthetic masked input');

    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-label', 'Synthetic masked textarea');

    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = 'Synthetic interaction';

    fixture.append(input, textarea, action);
    document.body.append(fixture);
  });

  // New documents flush only after interaction; the lazy recorder may still be starting.
  await expect
    .poll(
      async () => {
        await page.getByRole('button', { name: 'Synthetic interaction' }).click();
        return JSON.stringify(readReplaySnapshots(posthogPayloads)).includes(
          'Synthetic interaction',
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const inputMarker = 'E2E replay input marker';
  const textareaMarker = 'E2E replay textarea marker';
  await page.getByLabel('Synthetic masked input').fill(inputMarker);
  await page.getByLabel('Synthetic masked textarea').fill(textareaMarker);
  await page.getByRole('button', { name: 'Synthetic interaction' }).click();

  await expect.poll(() => snapshotUploadFailures, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect
    .poll(
      () => {
        const snapshots = readReplaySnapshots(posthogPayloads);
        return snapshots
          .filter((snapshot) => snapshot.type === 3 && snapshot.data.source === 5)
          .map((snapshot) => snapshot.data.text);
      },
      { timeout: 15_000 },
    )
    .toEqual(
      expect.arrayContaining(['*'.repeat(inputMarker.length), '*'.repeat(textareaMarker.length)]),
    );
  const snapshotText = JSON.stringify(readReplaySnapshots(posthogPayloads));
  expect(snapshotText).toContain('Synthetic interaction');
  expect(snapshotText).not.toContain(inputMarker);
  expect(snapshotText).not.toContain(textareaMarker);
  expect(snapshotText).not.toContain(privatePostContentMarker);
  await page.locator('#replay-synthetic-masking-fixture').evaluate((fixture) => fixture.remove());

  await page.getByRole('button', { name: `${privateMedia[0].altText} 크게 보기` }).click();
  const viewerDialog = page.getByRole('dialog');
  await expect(viewerDialog).toBeVisible();
  await viewerDialog.getByRole('button', { name: '다음 이미지' }).click();
  await expect(viewerDialog.getByTestId('post-media-viewer-image')).toHaveAccessibleName(
    privateMedia[1].altText,
  );
  await expect(viewerDialog.getByTestId('post-media-viewer-image')).toBeVisible();
  await expect(viewerDialog.getByTestId('post-media-viewer-counter')).toHaveText('2 / 2');
  await viewerDialog.getByRole('button', { name: '이미지 뷰어 닫기' }).click();
  await expect(viewerDialog).toBeHidden();
  await page.goto(prodAnalyticsOrigin);
  await page.getByRole('link', { name: '개인정보 처리방침' }).click();
  await expect(page).toHaveURL(`${prodAnalyticsOrigin}/privacy`);
});

test('prod channel Web runtime은 Account identity를 A→guest→B로 분리하고 endpoint 실패에도 인증 흐름을 유지한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Analytics Identity',
    handle: 'e2e-analytics-identity',
  });
  const nextViewer = await createE2ESession({
    displayName: 'E2E Analytics Identity Next',
    handle: 'e2e-analytics-identity-next',
  });
  const payloads: PostHogPayload[] = [];

  await page.route(posthogRoute, async (route) => {
    if (route.request().method() === 'POST') {
      payloads.push(...readPostHogPayloads(route.request().postDataBuffer()));
    }

    await route.fulfill({
      body: '{}',
      contentType: 'application/json',
      status: 200,
    });
  });
  await setE2ESessionCookie(context, viewer.token);
  await page.goto(`${prodAnalyticsOrigin}/home`);

  const mainNavigation = page.getByRole('navigation', { name: '주요 메뉴' });
  const utilityMenu = mainNavigation.getByRole('button', { name: '설정 및 기타' });
  const logout = mainNavigation.getByRole('button', { name: '로그아웃' });
  await utilityMenu.click();
  await expect(logout).toBeVisible();
  await expect
    .poll(() => payloads.filter((payload) => payload.event === '$identify').length)
    .toBe(1);

  const identifyPayload = payloads.find((payload) => payload.event === '$identify');
  expect(identifyPayload?.properties?.distinct_id).toBe(toGlobalId('Account', viewer.account.id));
  expect(JSON.stringify(identifyPayload)).not.toMatch(
    /email|displayName|handle|selected_profile_id/u,
  );

  await page.unroute(posthogRoute);
  await page.route(posthogRoute, async (route) => {
    if (route.request().method() === 'POST') {
      payloads.push(...readPostHogPayloads(route.request().postDataBuffer()));
    }

    await route.fulfill({ body: '{}', status: 503 });
  });

  await logout.click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();

  await page.getByRole('link', { name: '개인정보 처리방침' }).click();
  await expect(page).toHaveURL(/\/privacy$/u);
  await expect
    .poll(() =>
      payloads.find(
        (payload) => payload.event === '$pageview' && payload.properties?.$pathname === '/privacy',
      ),
    )
    .not.toBeUndefined();
  const anonymousPageview = payloads.find(
    (payload) => payload.event === '$pageview' && payload.properties?.$pathname === '/privacy',
  );

  await setE2ESessionCookie(context, nextViewer.token);
  await page.goto(`${prodAnalyticsOrigin}/home`);
  await utilityMenu.click();
  await expect(logout).toBeVisible();
  await expect
    .poll(
      () =>
        payloads.filter(
          (payload) =>
            payload.event === '$identify' &&
            payload.properties?.distinct_id === toGlobalId('Account', nextViewer.account.id),
        ).length,
    )
    .toBe(1);

  const anonymousDistinctId = anonymousPageview?.properties?.distinct_id;
  expect(anonymousDistinctId).toEqual(expect.any(String));
  expect(anonymousDistinctId).not.toBe(toGlobalId('Account', viewer.account.id));
  expect(anonymousDistinctId).not.toBe(toGlobalId('Account', nextViewer.account.id));
});
