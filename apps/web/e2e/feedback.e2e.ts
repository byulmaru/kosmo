import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('인증된 Web 사용자는 직접 피드백 페이지에서 전송하고 성공 상태를 본다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/feedback');
  await expect(page).toHaveURL(/\/feedback$/u);
  await expect(page.getByText('프로필과 설정 등 주요 메뉴를 확인합니다.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '로그인 테스트' })).toHaveCount(0);
  await page.getByRole('textbox', { name: '피드백 내용' }).fill('검색 결과가 더 빠르면 좋겠어요.');
  await page.getByRole('button', { name: '피드백 보내기' }).click();

  await expect(page.getByText('피드백을 전달했습니다. 감사합니다!')).toBeVisible();
});
