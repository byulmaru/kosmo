import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('shell action으로 URL을 바꾸지 않고 overlay를 열며 direct route fallback을 유지한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/home?context=notifications');
  const feedbackButton = page
    .getByTestId('universal-shell-root')
    .getByRole('button', { name: '피드백 보내기' });
  await expect(feedbackButton).toBeVisible();
  await feedbackButton.click();

  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/home\?context=notifications$/u);

  await dialog.getByRole('button', { name: '피드백 닫기' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/home\?context=notifications$/u);

  await page.goto('/home?context=notifications&feedback=open');
  await expect(page.getByRole('dialog', { name: '피드백 보내기' })).toHaveCount(0);

  await page.goto('/feedback?feedback=open');
  await expect(page.getByRole('dialog', { name: '피드백 보내기' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '피드백 보내기' })).toBeVisible();
});

test('guest public shell에는 feedback action과 query overlay를 노출하지 않는다', async ({
  page,
}) => {
  await createE2ESession({ handle: 'e2e-feedback-guest' });

  await page.goto('/@e2e-feedback-guest?feedback=open');

  await expect(page.getByRole('button', { name: '피드백 보내기' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '피드백 보내기' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '피드백 보내기' })).toHaveCount(0);
});

test('submitting explicit close를 차단하고 성공 후 같은 overlay에서 연속 입력한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  let releaseSubmit!: () => void;
  const submitGate = new Promise<void>((resolve) => {
    releaseSubmit = resolve;
  });
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'FeedbackFormSubmitFeedbackMutation')) {
      await route.continue();
      return;
    }

    await submitGate;
    await route.fulfill({
      body: JSON.stringify({ data: { submitFeedback: { completed: true } } }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/home');
  await page
    .getByTestId('universal-shell-root')
    .getByRole('button', { name: '피드백 보내기' })
    .click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  const body = dialog.getByRole('textbox', { name: '피드백 내용' });
  const submit = dialog.getByRole('button', { name: '피드백 보내기' });

  await body.fill('제출 중에는 닫히면 안 되는 피드백');
  await submit.click();
  await expect(submit).toHaveAttribute('aria-busy', 'true');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  releaseSubmit();
  await expect(dialog.getByText('피드백을 전달했습니다. 감사합니다!')).toBeVisible();
  await expect(body).toHaveValue('');
  await expect(page).toHaveURL(/\/home$/u);

  await body.fill('바로 이어서 보내는 두 번째 피드백');
  await expect(submit).toBeEnabled();
});

test('overlay가 focus와 document scroll을 복원한다', async ({ context, page }) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 800, width: 900 });
  await page.goto('/home');
  await page.evaluate(() => {
    document.body.style.minHeight = '2000px';
    window.scrollTo(0, 420);
  });
  const feedbackButton = page
    .getByTestId('universal-shell-root')
    .getByRole('button', { name: '피드백 보내기' });
  await feedbackButton.focus();
  await feedbackButton.click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });

  await expect(dialog.getByRole('button', { name: '피드백 닫기' })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(420);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await dialog.getByRole('button', { name: '피드백 닫기' }).click();

  await expect(feedbackButton).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(420);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('keyboard trap, Escape와 clean backdrop을 한 close 경계로 처리한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 800, width: 900 });
  await page.goto('/home');
  const feedbackButton = page
    .getByTestId('universal-shell-root')
    .getByRole('button', { name: '피드백 보내기' });
  await feedbackButton.focus();
  await feedbackButton.click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  const close = dialog.getByRole('button', { name: '피드백 닫기' });
  const body = dialog.getByRole('textbox', { name: '피드백 내용' });

  await expect(page.getByTestId('universal-shell-root')).toHaveAttribute('aria-hidden', 'true');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(body).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/home$/u);
  await expect(feedbackButton).toBeFocused();

  await feedbackButton.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/home$/u);
});

test('dirty backdrop은 확인과 폐기 뒤에만 overlay를 닫는다', async ({ context, page }) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 800, width: 900 });
  await page.goto('/home');
  await page
    .getByTestId('universal-shell-root')
    .getByRole('button', { name: '피드백 보내기' })
    .click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  const body = dialog.getByRole('textbox', { name: '피드백 내용' });
  await body.fill('UI 폐기 확인이 필요한 피드백');

  await page.mouse.click(10, 10);
  const confirm = page.getByRole('alertdialog', { name: '작성 중인 피드백을 버릴까요?' });
  await expect(confirm).toBeVisible();
  const continueButton = confirm.getByRole('button', { name: '계속 작성' });
  const discardButton = confirm.getByRole('button', { name: '피드백 버리기' });
  await continueButton.click();
  await expect(dialog).toBeVisible();
  await expect(body).toHaveValue('UI 폐기 확인이 필요한 피드백');

  await page.mouse.click(10, 10);
  await expect(confirm).toBeVisible();
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(discardButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(discardButton).toBeFocused();
  await discardButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/home$/u);
});

test('390px sheet와 900px·1400px dialog geometry를 실제 Web runtime에서 유지한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 568, width: 390 });
  await page.goto('/home');
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page.locator('#mobile-sidebar').getByRole('button', { name: '피드백 보내기' }).click();
  const surface = page.getByTestId('feedback-overlay-surface');
  const mobileBox = await surface.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.x).toBeCloseTo(0, 0);
  expect(mobileBox!.width).toBeCloseTo(390, 0);
  expect(mobileBox!.y + mobileBox!.height).toBeCloseTo(568, 0);
  expect(mobileBox!.height).toBeLessThanOrEqual(568 * 0.85 + 1);
  const scrollMetrics = await page.getByTestId('feedback-overlay-body').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

  await page.getByRole('button', { name: '피드백 닫기' }).click();
  for (const viewport of [
    { height: 800, width: 900 },
    { height: 900, width: 1400 },
  ]) {
    await page.setViewportSize(viewport);
    await page
      .getByTestId('universal-shell-root')
      .getByRole('button', { name: '피드백 보내기' })
      .click();
    await expect(surface).toBeVisible();
    const desktopBox = await surface.boundingBox();
    expect(desktopBox).not.toBeNull();
    expect(desktopBox!.width).toBeCloseTo(600, 0);
    expect(desktopBox!.x + desktopBox!.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(desktopBox!.height).toBeLessThanOrEqual(viewport.height * 0.85 + 1);
    await page.getByRole('button', { name: '피드백 닫기' }).click();
  }
});
