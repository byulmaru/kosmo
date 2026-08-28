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

test('Web runtime은 PostHog 표준 pageview·autocapture·metadata와 remote config를 유지한다', async ({
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Analytics Profile',
    handle: 'e2e-analytics-profile',
  });
  const payloads: PostHogPayload[] = [];
  const posthogRequests: string[] = [];
  await page.route(`${posthogOrigin}/**`, async (route) => {
    posthogRequests.push(route.request().url());
    if (route.request().method() === 'POST') {
      payloads.push(...readPostHogPayloads(route.request().postDataBuffer()));
    }

    await route.fulfill({
      body: JSON.stringify({ autocapture_opt_out: false }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/?utm_source=newsletter#overview');
  await expect.poll(() => payloads.some((payload) => payload.event === '$pageview')).toBe(true);

  await page.goto(`/${viewer.profile?.handle}?source=analytics-test#profile`);
  await expect
    .poll(() =>
      payloads.some(
        (payload) =>
          payload.event === '$pageview' &&
          payload.properties?.$pathname === `/${viewer.profile?.handle}`,
      ),
    )
    .toBe(true);
  await page.getByRole('link', { name: '개인정보 처리방침' }).click();
  await expect(page).toHaveURL(/\/privacy$/u);
  await expect
    .poll(() =>
      payloads.some(
        (payload) => payload.event === '$pageview' && payload.properties?.$pathname === '/privacy',
      ),
    )
    .toBe(true);
  await expect.poll(() => payloads.some((payload) => payload.event === '$autocapture')).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(() => payloads.some((payload) => payload.event === '$pageleave')).toBe(true);

  const rootPageview = payloads.find(
    (payload) => payload.event === '$pageview' && payload.properties?.$pathname === '/',
  );
  expect(rootPageview?.properties?.$current_url).toContain('/?utm_source=newsletter#overview');
  expect(rootPageview?.properties?.$session_entry_utm_source).toBe('newsletter');
  expect(posthogRequests.some((url) => new URL(url).pathname.startsWith('/flags'))).toBe(true);
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
