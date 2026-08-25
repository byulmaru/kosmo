import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { toGlobalId } from './graphql';

const posthogOrigin = 'https://posthog.e2e.invalid';

type PostHogPayload = {
  event?: unknown;
  properties?: Record<string, unknown>;
};

function readPostHogPayloads(body: string | null): PostHogPayload[] {
  if (!body) {
    return [];
  }

  try {
    const payload = JSON.parse(body) as unknown;
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

test('Web runtime은 route template pageview만 전송하고 automatic telemetry와 민감 URL을 보내지 않는다', async ({
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Analytics Profile',
    handle: 'e2e-analytics-profile',
  });
  const payloads: PostHogPayload[] = [];
  await page.route(`${posthogOrigin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      payloads.push(...readPostHogPayloads(route.request().postData()));
    }

    await route.fulfill({
      body: '{}',
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto(
    '/?secret_query=should-not-be-captured&utm_source=private-campaign&gclid=private-click-id#secret-fragment',
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
  await page.waitForTimeout(200);

  const pageviews = payloads.filter((payload) => payload.event === '$pageview');
  expect(pageviews).toHaveLength(5);
  expect(pageviews.map((payload) => payload.properties?.route_template)).toEqual([
    '/',
    '/[profileHandle]',
    '/[profileHandle]',
    '/privacy',
    '/privacy',
  ]);
  expect(payloads.every((payload) => payload.event === '$pageview')).toBe(true);
  expect(JSON.stringify(payloads)).not.toContain('secret_query');
  expect(JSON.stringify(payloads)).not.toContain('secret-fragment');
  expect(JSON.stringify(payloads)).not.toContain('private-campaign');
  expect(JSON.stringify(payloads)).not.toContain('private-click-id');

  for (const payload of pageviews) {
    expect(payload.properties).not.toHaveProperty('$current_url');
    expect(payload.properties).not.toHaveProperty('$pathname');
    expect(payload.properties).not.toHaveProperty('$prev_pageview_pathname');
    expect(payload.properties).not.toHaveProperty('$session_entry_utm_source');
    expect(payload.properties).not.toHaveProperty('$session_entry_gclid');
  }
});

test('Account identity는 opaque Account ID만 보내고 analytics endpoint 실패에도 인증 흐름을 유지한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Analytics Identity',
    handle: 'e2e-analytics-identity',
  });
  const payloads: PostHogPayload[] = [];

  await page.route(`${posthogOrigin}/**`, async (route) => {
    if (route.request().method() === 'POST') {
      payloads.push(...readPostHogPayloads(route.request().postData()));
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
    await route.fulfill({ body: '{}', status: 503 });
  });

  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
});
