import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation, readGraphQLOperation, waitForGraphQLOperation } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('인증된 Web 사용자는 메뉴에서 피드백을 보내고 성공 상태를 본다', async ({ context, page }) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  let receivedVariables: Record<string, unknown> | null = null;
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'FeedbackFormSubmitFeedbackMutation')) {
      await route.continue();
      return;
    }

    receivedVariables = readGraphQLOperation(route.request().postData())?.variables ?? null;
    await route.fulfill({
      body: JSON.stringify({ data: { submitFeedback: { completed: true } } }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/home');
  const feedbackLink = page.getByRole('link', { name: '피드백 보내기' });
  await expect(feedbackLink).toHaveAttribute('href', '/feedback');
  await feedbackLink.click();
  await expect(page).toHaveURL(/\/feedback$/u);
  await expect(page.getByText('프로필과 설정 등 주요 메뉴를 확인합니다.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '로그인 테스트' })).toHaveCount(0);
  await page.getByRole('textbox', { name: '피드백 내용' }).fill('검색 결과가 더 빠르면 좋겠어요.');
  const response = waitForGraphQLOperation(page, 'FeedbackFormSubmitFeedbackMutation');
  await page.getByRole('button', { name: '피드백 보내기' }).click();
  await response;

  await expect(page.getByText('피드백을 전달했습니다. 감사합니다!')).toBeVisible();
  expect(receivedVariables).toMatchObject({
    input: { body: '검색 결과가 더 빠르면 좋겠어요.', kind: 'POSITIVE' },
  });
});

test('Slack 전달 실패 시 Web 입력값을 유지하고 안전한 재시도 상태를 표시한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'FeedbackFormSubmitFeedbackMutation')) {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: JSON.stringify({ errors: [{ message: 'delivery failed' }] }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/feedback');
  const message = '이 입력은 실패해도 남아 있어야 해요.';
  const body = page.getByRole('textbox', { name: '피드백 내용' });
  await body.fill(message);
  await page.getByRole('button', { name: '피드백 보내기' }).click();

  await expect(
    page.getByText('피드백을 전달하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '피드백 다시 시도' })).toBeVisible();
  await expect(body).toHaveValue(message);
});
