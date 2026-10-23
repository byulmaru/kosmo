import { AccountCoachmarks, db } from '@kosmo/core/db';
import { CoachmarkGuide } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

for (const width of [390, 1440]) {
  test(`타임라인 최초 안내는 계정에 한 번 기록되고 로컬 도움말에서 다시 열린다 (${width}px)`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const viewer = await createE2ESession({ seenCoachmarks: [] });
    await setE2ESessionCookie(context, viewer.token);
    const shownRows = () =>
      db.select().from(AccountCoachmarks).where(eq(AccountCoachmarks.accountId, viewer.account.id));

    await page.goto('/home');
    const tabsGuide = page.getByRole('dialog', { name: '홈과 로컬 둘러보기' });
    await expect(tabsGuide).toBeVisible();
    await expect
      .poll(async () => (await shownRows()).map(({ guide }) => guide))
      .toEqual([CoachmarkGuide.TIMELINE]);
    const [firstShown] = await shownRows();
    await tabsGuide.getByRole('button', { name: '다음', exact: true }).click();
    const profileGuide = page.getByRole('dialog', { name: '지금 활동하는 프로필' });
    await expect(profileGuide).toBeVisible();
    if (width === 390) {
      await expect(page.locator('#mobile-sidebar')).toBeVisible();
    }
    await profileGuide.getByRole('button', { name: '건너뛰기' }).click();
    await expect(profileGuide).toBeHidden();
    await expect(page.getByRole('button', { name: '타임라인 도움말' })).toBeFocused();
    if (width === 390) {
      await expect(page.locator('#mobile-sidebar')).toHaveCount(0);
    }

    await page.goto('/local');
    const help = page.getByRole('button', { name: '타임라인 도움말' });
    await expect(help).toBeVisible();
    await expect(tabsGuide).toBeHidden();
    await help.click();
    await expect(tabsGuide).toBeVisible();
    await tabsGuide.getByRole('button', { name: '건너뛰기' }).click();
    await expect(help).toBeFocused();
    expect(await shownRows()).toEqual([firstShown]);
  });
}
