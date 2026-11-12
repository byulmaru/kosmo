import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(async () => resetE2EDatabase());

test('모바일 route 헤더와 fallback 메뉴는 drawer 닫힘 후 포커스를 복원한다', async ({ page }) => {
  const session = await createE2ESession({ handle: 'route-header' });
  await setE2ESessionCookie(page.context(), session.token);
  for (const [path, title] of [
    ['/home', '홈'],
    ['/local', '로컬'],
    ['/notifications', '알림'],
    ['/settings', '설정'],
    ['/bookmarks', '북마크'],
    ['/follow-requests', '팔로워 요청'],
    ['/feedback', '피드백 보내기'],
  ]) {
    await page.goto(path);
    const trigger = page.getByRole('button', { name: '메뉴 열기' });
    await expect(trigger).toHaveCount(1);
    if (['/home', '/local', '/notifications', '/settings'].includes(path)) {
      await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
    }
    await trigger.click();
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#mobile-sidebar')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('설정 direct link의 route 헤더는 부모 이동과 breakpoint 전환을 유지한다', async ({ page }) => {
  const session = await createE2ESession({ handle: 'route-settings' });
  await setE2ESessionCookie(page.context(), session.token);
  await page.goto('/settings/theme');
  for (const width of [390, 767, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('heading', { name: '테마', exact: true })).toHaveCount(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '설정으로 돌아가기' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('button', { name: '메뉴 열기' })).toBeVisible();
});

test('공개 첫 화면도 route 제목과 방문자 메뉴를 유지한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '타임라인 둘러보기', exact: true })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible();
});
