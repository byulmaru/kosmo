import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const html = await readFile(new URL('../../app/public/index.html', import.meta.url), 'utf8');

for (const scenario of [
  { preference: 'dark', os: 'light', expected: 'dark' },
  { preference: 'light', os: 'dark', expected: 'light' },
  { preference: 'system', os: 'dark', expected: 'dark' },
  { preference: null, os: 'light', expected: 'light' },
  { preference: 'invalid', os: 'dark', expected: 'dark' },
  { preference: 'read-error', os: 'dark', expected: 'dark' },
] as const) {
  test(`앱 실행 전 테마: ${scenario.preference}, OS ${scenario.os}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scenario.os });
    await page.addInitScript((preference) => {
      if (preference === 'read-error') {
        Storage.prototype.getItem = () => {
          throw new Error('storage unavailable');
        };
      } else if (preference === null) {
        localStorage.removeItem('kosmo.theme-preference');
      } else {
        localStorage.setItem('kosmo.theme-preference', preference);
      }
    }, scenario.preference);
    // Serve the production HTML without any application JavaScript.
    await page.route('http://theme.test/**', (route) =>
      route.request().resourceType() === 'document'
        ? route.fulfill({ contentType: 'text/html', body: html })
        : route.abort(),
    );
    await page.goto('http://theme.test/');
    const background = scenario.expected === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    await expect(page.locator('html')).toHaveCSS('background-color', background);
    await expect(page.locator('body')).toHaveCSS('background-color', background);
    await expect(page.locator('html')).toHaveCSS('color-scheme', scenario.expected);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      scenario.expected === 'dark' ? '#000000' : '#FFFFFF',
    );
    await expect(page.locator('#root')).toBeEmpty();
  });
}
