import { gunzipSync } from 'node:zlib';
import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { toGlobalId } from './graphql';

const posthogOrigin = 'https://posthog.e2e.invalid';
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

test('PostHog 설정이 없는 Web build는 analytics 요청 없이 정상 렌더링된다', async ({ page }) => {
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

test('Web runtime은 정규화 pathname pageview만 전송하고 automatic telemetry와 민감 URL을 보내지 않는다', async ({
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Analytics Profile',
    handle: 'e2e-analytics-profile',
  });
  const payloads: PostHogPayload[] = [];
  await page.route(`${posthogOrigin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      payloads.push(...readPostHogPayloads(route.request().postDataBuffer()));
    }

    await route.fulfill({
      body: '{}',
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto(
    '/?secret_query=should-not-be-captured&utm_source=newsletter&gclid=campaign-click-id#secret-fragment',
  );
  await expect
    .poll(() => payloads.filter((payload) => payload.event === '$pageview').length)
    .toBe(1);

  await page.waitForTimeout(200);
  expect(payloads.filter((payload) => payload.event === '$pageview')).toHaveLength(1);

  await page.goto(`/${viewer.profile?.handle}?secret_query=profile#secret-fragment`);
  await expect
    .poll(() => payloads.filter((payload) => payload.event === '$pageview').length)
    .toBe(2);

  await page.goto(`/${viewer.profile?.handle}?another_query=private#another-fragment`);
  await expect
    .poll(() => payloads.filter((payload) => payload.event === '$pageview').length)
    .toBe(3);

  await page.getByRole('link', { name: '개인정보 처리방침' }).click();
  await expect(page).toHaveURL(/\/privacy$/u);
  await expect
    .poll(() => payloads.filter((payload) => payload.event === '$pageview').length)
    .toBe(4);

  await page.goto('/privacy?secret_query=second#secret-fragment');
  await expect
    .poll(() => payloads.filter((payload) => payload.event === '$pageview').length)
    .toBe(5);

  const pageviews = payloads.filter((payload) => payload.event === '$pageview');
  expect(pageviews).toHaveLength(5);
  expect(pageviews.map((payload) => payload.properties?.$pathname)).toEqual([
    '/',
    '/[profileHandle]',
    '/[profileHandle]',
    '/privacy',
    '/privacy',
  ]);
  expect(payloads.every((payload) => payload.event === '$pageview')).toBe(true);
  expect(JSON.stringify(payloads)).not.toContain('secret_query');
  expect(JSON.stringify(payloads)).not.toContain('secret-fragment');

  for (const [index, payload] of pageviews.entries()) {
    expect(payload.properties).not.toHaveProperty('$current_url');
    expect(payload.properties).not.toHaveProperty('$prev_pageview_pathname');
    expect(payload.properties?.$session_entry_utm_source).toBe(
      index === 0 ? 'newsletter' : undefined,
    );
    expect(payload.properties?.$session_entry_gclid).toBe(
      index === 0 ? 'campaign-click-id' : undefined,
    );
  }
});

test('Account identity는 A→guest→B에서 분리되고 endpoint 실패에도 인증 흐름을 유지한다', async ({
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

  await page.route(`${posthogOrigin}/**`, async (route) => {
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

  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect
    .poll(() => payloads.filter((payload) => payload.event === '$identify').length)
    .toBe(1);

  const identifyPayload = payloads.find((payload) => payload.event === '$identify');
  expect(identifyPayload?.properties?.distinct_id).toBe(toGlobalId('Account', viewer.account.id));
  expect(JSON.stringify(identifyPayload)).not.toMatch(
    /email|displayName|handle|selected_profile_id/u,
  );

  await page.unroute(`${posthogOrigin}/**`);
  await page.route(`${posthogOrigin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      payloads.push(...readPostHogPayloads(route.request().postDataBuffer()));
    }

    await route.fulfill({ body: '{}', status: 503 });
  });

  await page.getByRole('button', { name: '로그아웃' }).click();
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
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
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
