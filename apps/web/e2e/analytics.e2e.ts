import { resetE2EDatabase } from './db-fixtures';
import { expect, test } from './fixtures';

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

  await expect(page.getByRole('link', { name: 'KOSMO에서 계속하기' })).toBeVisible();
  await expect(page.getByText('아직 게시글이 없어요', { exact: true })).toBeVisible();
  expect(analyticsRequests).toEqual([]);
});
