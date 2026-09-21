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
const noAnalyticsOrigin = `http://127.0.0.1:${4174 + Number(process.env.KOSMO_TEST_PORT_OFFSET ?? 0)}`;

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

  await page.goto(noAnalyticsOrigin);

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
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/e/') {
      posthogPayloads.push(...readPostHogPayloads(request.postDataBuffer()));
    }

    await route.fulfill({
      body: JSON.stringify({ autocapture_opt_out: false }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect
    .poll(() => posthogPayloads.some((payload) => payload.event === '$pageview'))
    .toBe(true);

  await page.goto(`/${viewer.profile.handle}`);
  await page.getByRole('button', { name: `${privateMedia[0].altText} 크게 보기` }).click();
  const viewerDialog = page.getByRole('dialog');
  await expect(viewerDialog).toBeVisible();
  const nextImage = viewerDialog.getByRole('button', { name: '다음 이미지' });
  const previousAutocaptureCount = posthogPayloads.filter(
    (payload) => payload.event === '$autocapture',
  ).length;
  await nextImage.click();
  await expect
    .poll(() => posthogPayloads.filter((payload) => payload.event === '$autocapture').length)
    .toBeGreaterThan(previousAutocaptureCount);
  const autocapturePayloads = posthogPayloads.filter((payload) => payload.event === '$autocapture');
  expect(JSON.stringify(autocapturePayloads)).not.toContain(privatePostContentMarker);
  for (const { altText } of privateMedia) {
    expect(JSON.stringify(autocapturePayloads)).not.toContain(altText);
  }
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
  await page.goto('/home');

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
  await page.goto('/home');
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
