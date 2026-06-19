import { expect, test } from '@playwright/test';

let closeDb: (() => Promise<void>) | undefined;

const getDb = async () => {
  const dbModule = await import('@kosmo/core/db');
  closeDb = () => dbModule.pg.end();

  return dbModule;
};

test.afterAll(async () => {
  await closeDb?.();
});

test('logs in through the local OIDC mock and creates a profile', async ({ context, page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /나만의 타임라인/ })).toBeVisible();
  await page.getByRole('link', { name: '시작하기' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: '프로필을 만들어 시작하세요' })).toBeVisible();

  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === 'kosmo_session')).toBe(true);

  const { Accounts, db, Profiles, Sessions } = await getDb();
  const accounts = await db.select().from(Accounts);
  const sessions = await db.select().from(Sessions);

  expect(accounts).toHaveLength(1);
  expect(accounts[0]?.oidcSubject).toMatch(/^oidc-mock-/);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.accountId).toBe(accounts[0]?.id);

  const handle = `e2e_${Date.now()}`;

  await expect(page.getByRole('button', { name: '프로필 만들기' })).toBeVisible();
  await page.getByRole('button', { name: '프로필 목록' }).click();
  await page.getByRole('menuitem', { name: /새 프로필 추가/ }).click();
  await page.getByRole('textbox', { name: '프로필 핸들' }).fill(handle);
  await page.getByRole('button', { exact: true, name: '만들기' }).click();

  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible();
  await expect(page.getByLabel('활성 프로필').getByText(`@${handle}`)).toBeVisible();

  const profiles = await db.select().from(Profiles);
  expect(profiles).toHaveLength(1);
  expect(profiles[0]?.handle).toBe(handle);
});

test('rejects malformed OIDC callbacks', async ({ context, request }) => {
  const missingParameters = await request.get('/login/callback', { maxRedirects: 0 });
  expect(missingParameters.status()).toBe(400);

  const loginStart = await context.request.get('/login', { maxRedirects: 0 });
  expect(loginStart.status()).toBe(302);

  const mismatchedState = await context.request.get('/login/callback?code=invalid&state=wrong', {
    maxRedirects: 0,
  });
  expect(mismatchedState.status()).toBe(400);
});
