import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, waitForGraphQLOperation } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('compose에서 공개 범위와 500자 제한을 적용해 createPost를 실행한다', async ({
  context,
  page,
}) => {
  const body = 'E2E compose createPost body';
  const editorBody = `  ${body}\n\nsecond line  `;
  const viewer = await createE2ESession({
    displayName: 'E2E Composer',
    handle: 'e2e-composer',
  });
  await setE2ESessionCookie(context, viewer.token);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/compose');

  const composer = page.getByLabel('새 게시글 작성').first();
  const input = composer.getByRole('textbox', { name: '게시글 본문' });
  const submit = composer.getByRole('button', { name: '게시', exact: true });

  await expect(composer.getByText('@e2e-composer')).toBeVisible();
  await expect(submit).toBeDisabled();
  await input.fill('x'.repeat(501));
  await expect(composer.getByText('-1', { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  await input.fill(' '.repeat(500));
  await expect(composer.getByText('500', { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();

  await input.fill(editorBody);
  const visibilityTrigger = composer.getByRole('button', { name: '조용한 공개' });
  const editorBeforeOpen = await input.boundingBox();
  expect(editorBeforeOpen).not.toBeNull();

  await visibilityTrigger.click();
  const visibilityMenu = page.getByRole('menu', { name: '게시글 공개 설정' });
  await expect(visibilityMenu).toBeVisible();
  const visibilityMenuBox = await visibilityMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(visibilityMenuBox).not.toBeNull();
  expect(visibilityMenuBox?.width).toBe(256);
  expect(viewport).not.toBeNull();
  expect(visibilityMenuBox?.x).toBeGreaterThanOrEqual(0);
  expect(visibilityMenuBox!.x + visibilityMenuBox!.width).toBeLessThanOrEqual(viewport!.width);

  const editorAfterOpen = await input.boundingBox();
  expect(editorAfterOpen).not.toBeNull();
  expect(editorAfterOpen?.y).toBe(editorBeforeOpen?.y);

  await expect(visibilityMenu.getByRole('menuitemradio', { name: /^조용한 공개/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await composer.getByText('@e2e-composer').click();
  await expect(visibilityMenu).toHaveCount(0);

  await visibilityTrigger.click();
  await page.keyboard.press('Escape');
  await expect(visibilityMenu).toHaveCount(0);
  await expect(visibilityTrigger).toBeFocused();

  await visibilityTrigger.click();
  await page.keyboard.press('End');
  await expect(visibilityMenu.getByRole('menuitemradio', { name: /^팔로워만/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(visibilityMenu).toHaveCount(0);

  await visibilityTrigger.click();
  await page.keyboard.press('Home');
  const publicOption = visibilityMenu.getByRole('menuitemradio', { name: /^공개/ });
  await expect(publicOption).toBeFocused();
  await page.keyboard.press('Space');
  await expect(visibilityMenu).toHaveCount(0);
  await expect(composer.getByRole('button', { name: '공개', exact: true })).toBeFocused();

  const mutationResponse = waitForGraphQLOperation(page, 'PostComposerCreatePostMutation');
  await submit.click();
  const response = await mutationResponse;
  const operation = readGraphQLOperation(response.request().postData());
  const responseBody = (await response.json()) as {
    data?: { createPost?: { post?: { id?: string | null } | null } | null };
  };

  expect(operation?.operationName).toBe('PostComposerCreatePostMutation');
  expect(operation?.variables).toMatchObject({
    input: {
      bodyText: `${body}\n\nsecond line`,
      visibility: 'PUBLIC',
    },
  });
  expect(responseBody.data?.createPost?.post?.id).toEqual(expect.any(String));
  await expect(input).toHaveValue('');

  await page.goto('/@e2e-composer');
  await expect(page.getByText(body)).toBeVisible();
});

test('compose에서 이미지 clipboard paste는 본문을 보존하고 기존 Media 제출 흐름을 사용한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Clipboard Composer',
    handle: 'e2e-clipboard-composer',
  });
  await setE2ESessionCookie(context, viewer.token);

  const mediaId = 'media-clipboard-e2e';
  let createPostVariables: Record<string, unknown> | null = null;
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName === 'PostComposerIssueMediaUploadUrlMutation') {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            issueMediaUploadUrl: {
              media: { id: mediaId },
              uploadUrl: 'https://upload.example/clipboard',
            },
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (operation?.operationName === 'PostComposerCompleteMediaUploadMutation') {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            completeMediaUpload: {
              media: { id: mediaId, state: 'READY' },
            },
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (operation?.operationName === 'PostComposerCreatePostMutation') {
      createPostVariables = operation.variables ?? null;
      await route.fulfill({
        body: JSON.stringify({ data: { createPost: { post: { id: 'post-clipboard-e2e' } } } }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
  await page.route('https://upload.example/**', async (route) => {
    await route.fulfill({ body: '', status: 204 });
  });

  await page.goto('/compose');
  const composer = page.getByLabel('새 게시글 작성').first();
  const input = composer.getByRole('textbox', { name: '게시글 본문' });
  const submit = composer.getByRole('button', { name: '게시', exact: true });
  await input.fill('기존 본문');
  await input.evaluate((element) => element.setSelectionRange(2, 2));

  await input.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File(['clipboard image'], 'clipboard.png', { type: 'image/png' }));
    clipboardData.setData('text/plain', '이 텍스트는 본문에 들어가면 안 됩니다.');
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  });

  await expect(input).toHaveValue('기존 본문');
  await expect(input).toHaveJSProperty('selectionStart', 2);
  await expect(composer.getByLabel('첨부 이미지 1, 업로드 완료')).toBeVisible();
  await expect(submit).toBeEnabled();

  const createResponse = waitForGraphQLOperation(page, 'PostComposerCreatePostMutation');
  await submit.click();
  const response = await createResponse;
  expect(response.status()).toBe(200);
  expect(createPostVariables).toMatchObject({
    input: {
      bodyText: '기존 본문',
      media: [{ altText: null, mediaId }],
    },
  });
  await expect(input).toHaveValue('');
});

test('compose의 touch 취소가 본문 포커스와 편집기 강조 상태를 유지한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Touch Composer',
    handle: 'e2e-touch-composer',
  });
  await setE2ESessionCookie(context, viewer.token);
  await page.setViewportSize({ width: 280, height: 720 });
  await page.goto('/compose');

  const composer = page.getByLabel('새 게시글 작성').first();
  const input = composer.getByRole('textbox', { name: '게시글 본문' });
  const editorSurface = composer.getByTestId('post-composer-editor-surface');
  const visibilityTrigger = composer.getByRole('button', { name: '조용한 공개' });
  const unfocusedBorderColor = await editorSurface.evaluate(
    (element) => getComputedStyle(element).borderColor,
  );

  await input.fill('touch 취소 뒤에도 포커스를 유지하는 본문입니다.');
  await expect(input).toBeFocused();
  await expect
    .poll(() => editorSurface.evaluate((element) => getComputedStyle(element).borderColor))
    .not.toBe(unfocusedBorderColor);
  const focusedBorderColor = await editorSurface.evaluate(
    (element) => getComputedStyle(element).borderColor,
  );
  expect(focusedBorderColor).not.toBe(unfocusedBorderColor);

  const triggerBox = await visibilityTrigger.boundingBox();
  expect(triggerBox).not.toBeNull();
  const session = await context.newCDPSession(page);
  try {
    const x = triggerBox!.x + triggerBox!.width / 2;
    const y = triggerBox!.y + triggerBox!.height / 2;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(100);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 180, y: y + 180 }],
    });
    await page.waitForTimeout(50);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(100);

    await expect(input).toBeFocused();
    await expect(page.getByRole('menu', { name: '게시글 공개 설정' })).toHaveCount(0);
    const borderAfterCancel = await editorSurface.evaluate(
      (element) => getComputedStyle(element).borderColor,
    );
    expect(borderAfterCancel).toBe(focusedBorderColor);
    expect(borderAfterCancel).not.toBe(unfocusedBorderColor);
  } finally {
    await session.detach();
  }
});
