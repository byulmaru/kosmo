import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('query overlay의 clean open, back, forward, fresh-load close와 direct fallback을 보존한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/home?context=notifications');
  const feedbackLink = page.getByRole('link', { name: '피드백 보내기' });
  await expect(feedbackLink).toHaveAttribute('href', '/home?context=notifications&feedback=open');
  await feedbackLink.click();
  await expect(page).toHaveURL(/\/home\?context=notifications&feedback=open$/u);
  await expect(page.getByRole('dialog', { name: '피드백 보내기' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/home\?context=notifications$/u);
  await expect(page.getByRole('dialog', { name: '피드백 보내기' })).toHaveCount(0);

  await page.goForward();
  const reopenedDialog = page.getByRole('dialog', { name: '피드백 보내기' });
  await expect(reopenedDialog).toBeVisible();
  await reopenedDialog.getByRole('button', { name: '피드백 닫기' }).click();
  await expect(page).toHaveURL(/\/home\?context=notifications$/u);
  await expect(reopenedDialog).toHaveCount(0);

  await page.goto('/home?context=notifications&feedback=open');
  const freshDialog = page.getByRole('dialog', { name: '피드백 보내기' });
  await expect(freshDialog).toBeVisible();
  await freshDialog.getByRole('button', { name: '피드백 닫기' }).click();
  await expect(page).toHaveURL(/\/home\?context=notifications$/u);
  await expect(freshDialog).toHaveCount(0);

  await page.goto('/feedback?feedback=open');
  await expect(page.getByRole('dialog', { name: '피드백 보내기' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '피드백 보내기' })).toBeVisible();
});

test('동적 route parameter를 feedback query로 복제하지 않는다', async ({ context, page }) => {
  const viewer = await createE2ESession({ handle: 'e2e-feedback-route' });
  await setE2ESessionCookie(context, viewer.token);

  const originalUrl = '/@e2e-feedback-route/followers?context=thread';
  await page.goto(originalUrl);
  const feedbackLink = page.getByRole('link', { name: '피드백 보내기' });
  await expect(feedbackLink).toHaveAttribute(
    'href',
    '/@e2e-feedback-route/followers?context=thread&feedback=open',
  );

  await feedbackLink.click();
  await expect(page).toHaveURL(/\/@e2e-feedback-route\/followers\?context=thread&feedback=open$/u);
  await page.reload();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '피드백 닫기' }).click();
  await expect(page).toHaveURL(/\/@e2e-feedback-route\/followers\?context=thread$/u);
});

test('dirty browser back은 query와 draft를 유지하고 폐기 확인 뒤에만 이동한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/home');
  await page.getByRole('link', { name: '피드백 보내기' }).click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  const body = dialog.getByRole('textbox', { name: '피드백 내용' });
  await body.fill('browser back에도 남아야 하는 피드백');

  await page.evaluate(() => history.back());
  const confirm = page.getByRole('alertdialog', { name: '작성 중인 피드백을 버릴까요?' });
  await expect(confirm).toBeVisible();
  await expect(page).toHaveURL(/\/home\?feedback=open$/u);

  await confirm.getByRole('button', { name: '계속 작성' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(body).toHaveValue('browser back에도 남아야 하는 피드백');

  await page.evaluate(() => history.back());
  const reopenedConfirm = page.getByRole('alertdialog', {
    name: '작성 중인 피드백을 버릴까요?',
  });
  await expect(reopenedConfirm).toBeVisible();
  await reopenedConfirm.getByRole('button', { name: '피드백 버리기' }).click();
  await expect(page).toHaveURL(/\/home$/u);
  await expect(page.getByRole('dialog', { name: '피드백 보내기' })).toHaveCount(0);
});

test('reload 후 history index와 origin이 없어도 다단계 back 목적지를 복원한다', async ({
  context,
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'navigation', { configurable: true, value: undefined });
  });
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/search');
  await page.getByRole('link', { name: '홈' }).click();
  await expect(page).toHaveURL(/\/home$/u);
  await page.getByRole('link', { name: '피드백 보내기' }).click();
  await page.reload();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  const body = dialog.getByRole('textbox', { name: '피드백 내용' });
  await body.fill('다단계 back에서도 남아야 하는 피드백');

  await page.evaluate(() => history.go(-2));
  const confirm = page.getByRole('alertdialog', { name: '작성 중인 피드백을 버릴까요?' });
  await expect(confirm).toBeVisible();
  await expect(page).toHaveURL(/\/home\?feedback=open$/u);
  await confirm.getByRole('button', { name: '계속 작성' }).click();
  await expect(body).toHaveValue('다단계 back에서도 남아야 하는 피드백');

  await page.evaluate(() => history.go(-2));
  const reopenedConfirm = page.getByRole('alertdialog', {
    name: '작성 중인 피드백을 버릴까요?',
  });
  await expect(reopenedConfirm).toBeVisible();
  await reopenedConfirm.getByRole('button', { name: '피드백 버리기' }).click();
  await expect(page).toHaveURL(/\/search$/u);
  await expect(page.getByRole('dialog', { name: '피드백 보내기' })).toHaveCount(0);
});

test('폐기 직후 history forward로 다시 열어도 버린 draft를 복원하지 않는다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/home');
  await page.getByRole('link', { name: '피드백 보내기' }).click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  const body = dialog.getByRole('textbox', { name: '피드백 내용' });
  await body.fill('폐기한 뒤 다시 보이면 안 되는 피드백');
  await dialog.getByRole('button', { name: '피드백 닫기' }).click();
  const confirm = page.getByRole('alertdialog', { name: '작성 중인 피드백을 버릴까요?' });
  await expect(confirm).toBeVisible();
  await page.evaluate(() => {
    window.addEventListener('popstate', () => history.forward(), { once: true });
  });
  await confirm.getByRole('button', { name: '피드백 버리기' }).click();

  await expect(page).toHaveURL(/\/home\?feedback=open$/u);
  await expect(dialog).toBeVisible();
  await expect(body).toHaveValue('');
});

test('submitting browser back을 차단하고 성공 후 같은 overlay에서 연속 입력한다', async ({
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
  const feedbackLink = page.getByRole('link', { name: '피드백 보내기' });
  await feedbackLink.click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  const body = dialog.getByRole('textbox', { name: '피드백 내용' });
  await body.fill('제출 중에는 닫히면 안 되는 피드백');
  const submit = dialog.getByRole('button', { name: '피드백 보내기' });
  await submit.click();
  await expect(submit).toHaveAttribute('aria-busy', 'true');

  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/home\?feedback=open$/u);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  releaseSubmit();
  await expect(dialog.getByText('피드백을 전달했습니다. 감사합니다!')).toBeVisible();
  await expect(body).toHaveValue('');
  await expect(page).toHaveURL(/\/home\?feedback=open$/u);

  await body.fill('바로 이어서 보내는 두 번째 피드백');
  await expect(submit).toBeEnabled();
});

test('query overlay가 focus와 document scroll을 복원한다', async ({ context, page }) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 800, width: 900 });
  await page.goto('/home');
  await page.evaluate(() => {
    document.body.style.minHeight = '2000px';
    window.scrollTo(0, 420);
  });
  const feedbackLink = page.getByRole('link', { name: '피드백 보내기' });
  await feedbackLink.focus();
  await feedbackLink.click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });

  await expect(dialog.getByRole('button', { name: '피드백 닫기' })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(420);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await dialog.getByRole('button', { name: '피드백 닫기' }).click();

  await expect(feedbackLink).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(420);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('실제 Web keyboard trap, Escape와 clean backdrop을 한 close 경계로 처리한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 800, width: 900 });
  await page.goto('/home');
  const feedbackLink = page.getByRole('link', { name: '피드백 보내기' });
  await feedbackLink.focus();
  await feedbackLink.click();
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
  await expect(page).toHaveURL(/\/home$/u);
  await expect(feedbackLink).toBeFocused();

  await page.goForward();
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page).toHaveURL(/\/home$/u);
});

test('dirty backdrop은 fresh overlay에서 확인과 폐기 뒤에만 history를 이동한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 800, width: 900 });
  await page.goto('/home');
  await page.getByRole('link', { name: '피드백 보내기' }).click();
  const dialog = page.getByRole('dialog', { name: '피드백 보내기' });
  const body = dialog.getByRole('textbox', { name: '피드백 내용' });
  await body.fill('UI 폐기 뒤 history도 한 번만 이동해야 해요.');
  await page.mouse.click(10, 10);
  const confirm = page.getByRole('alertdialog', { name: '작성 중인 피드백을 버릴까요?' });
  await expect(confirm).toBeVisible();
  const continueButton = confirm.getByRole('button', { name: '계속 작성' });
  const discardButton = confirm.getByRole('button', { name: '피드백 버리기' });
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(discardButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(continueButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(discardButton).toBeFocused();
  await discardButton.click();
  await expect(page).toHaveURL(/\/home$/u);
  await expect(dialog).toHaveCount(0);
});

test('390px sheet와 900px·1400px dialog geometry를 실제 Web runtime에서 유지한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 568, width: 390 });
  await page.goto('/home?feedback=open');
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

  for (const viewport of [
    { height: 800, width: 900 },
    { height: 900, width: 1400 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(surface).toBeVisible();
    const desktopBox = await surface.boundingBox();
    expect(desktopBox).not.toBeNull();
    expect(desktopBox!.width).toBeCloseTo(600, 0);
    expect(desktopBox!.x + desktopBox!.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(desktopBox!.height).toBeLessThanOrEqual(viewport.height * 0.85 + 1);
  }
});
