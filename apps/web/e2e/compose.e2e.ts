import {
  createE2EPost,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, toGlobalId, waitForGraphQLOperation } from './graphql';
import type { Locator } from '@playwright/test';

async function pasteComposerImage(input: Locator) {
  await input.evaluate((element) => {
    const clipboardData = new DataTransfer();
    const pngBytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      ),
      (character) => character.charCodeAt(0),
    );
    clipboardData.items.add(new File([pngBytes], 'clipboard.png', { type: 'image/png' }));
    clipboardData.setData('text/plain', '이 텍스트는 본문에 들어가면 안 됩니다.');
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }),
    );
  });
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('목록의 재게시 메뉴에서 direct Source를 유지한 Quote를 작성한다', async ({
  context,
  page,
}) => {
  const sourceBody = 'E2E Quote direct source body';
  const quoteBody = 'E2E Quote composer body';
  const viewer = await createE2ESession({
    displayName: 'E2E Quote Writer',
    handle: 'e2e-quote-writer',
  });
  const source = await createE2EPost({
    body: sourceBody,
    profileId: viewer.profile!.id,
  });
  await setE2ESessionCookie(context, viewer.token);
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/local');

  const sourceRow = page.getByRole('article').filter({ hasText: sourceBody });
  const trigger = sourceRow.getByRole('button', { name: '재게시' });
  await trigger.click();
  const menu = page.getByRole('menu', { name: '재게시 메뉴' });
  await menu.getByRole('menuitem', { name: '인용하기' }).click();

  const dialog = page.getByRole('dialog', { name: '인용 게시글 쓰기' });
  const body = dialog.getByRole('textbox', { name: '인용 게시글 본문' });
  await expect(dialog.getByTestId('source-post-preview')).toContainText(sourceBody);
  await expect(body).toBeFocused();
  await body.fill(quoteBody);

  await dialog.getByRole('button', { name: '닫기' }).click();
  const discard = page.getByRole('alertdialog', { name: '인용 게시글 작성을 취소할까요?' });
  await discard.getByRole('button', { name: '계속 작성' }).click();
  await expect(body).toBeFocused();
  await expect(body).toHaveValue(quoteBody);

  const mutationResponse = waitForGraphQLOperation(page, 'PostComposerCreatePostMutation');
  await dialog.getByRole('button', { name: '인용 게시' }).click();
  const response = await mutationResponse;
  const operation = readGraphQLOperation(response.request().postData());
  const responseBody = (await response.json()) as {
    data?: { createPost?: { post?: { id?: string | null } | null } | null };
    errors?: unknown[];
  };

  expect(response.ok(), JSON.stringify(responseBody, null, 2)).toBe(true);
  expect(responseBody.errors, JSON.stringify(responseBody, null, 2)).toBeUndefined();
  expect(operation?.variables).toMatchObject({
    input: {
      bodyText: quoteBody,
      repostSourceId: toGlobalId('Post', source.id),
      visibility: 'UNLISTED',
    },
  });
  expect(operation?.variables?.input).not.toHaveProperty('replyParentId');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.goto('/@e2e-quote-writer');
  const quoteRow = page.getByRole('article').filter({ hasText: quoteBody });
  await expect(quoteRow).toBeVisible();
  await expect(quoteRow.getByTestId('source-post-preview')).toContainText(sourceBody);
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

  const composer = page.getByLabel('게시글 작성', { exact: true });
  const input = composer.getByRole('textbox', { name: '게시물 내용' });
  const submit = composer.getByRole('button', { name: '게시', exact: true });

  await expect(input).toBeVisible();
  const footer = composer.getByTestId('mobile-composer-footer');
  await expect.poll(async () => (await footer.boundingBox())?.y).toBe(720 - 64);
  expect((await input.boundingBox())!.height).toBeGreaterThan(300);

  await expect(composer.getByText('@e2e-composer')).toBeVisible();
  await expect(submit).toBeDisabled();
  await input.fill('x'.repeat(501));
  await expect(composer.getByText('-1', { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  await input.fill(' '.repeat(500));
  await expect(composer.getByText('500', { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();

  await input.fill(editorBody);
  const visibilityTrigger = composer.getByRole('button', { name: /^공개 범위:/ });
  const editorBeforeOpen = await input.boundingBox();
  expect(editorBeforeOpen).not.toBeNull();

  await visibilityTrigger.click();
  const visibilityMenu = page.getByRole('radiogroup', { name: '공개 범위 선택' });
  await expect(visibilityMenu).toBeVisible();
  const visibilityMenuBox = await visibilityMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(visibilityMenuBox).not.toBeNull();
  expect(visibilityMenuBox?.width).toBe(240);
  expect(viewport).not.toBeNull();
  expect(visibilityMenuBox?.x).toBeGreaterThanOrEqual(0);
  expect(visibilityMenuBox!.x + visibilityMenuBox!.width).toBeLessThanOrEqual(viewport!.width);

  const editorAfterOpen = await input.boundingBox();
  expect(editorAfterOpen).not.toBeNull();
  expect(editorAfterOpen?.y).toBe(editorBeforeOpen?.y);

  await expect(visibilityMenu.getByRole('radio', { name: '조용한 공개' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await composer.getByRole('heading', { name: '글쓰기' }).click();
  await expect(visibilityMenu).toHaveCount(0);

  await visibilityTrigger.click();
  await page.keyboard.press('Escape');
  await expect(visibilityMenu).toHaveCount(0);
  await expect(visibilityTrigger).toBeFocused();

  await visibilityTrigger.click();
  await page.keyboard.press('End');
  await expect(visibilityMenu.getByRole('radio', { name: '팔로워만' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(visibilityMenu).toHaveCount(0);

  await visibilityTrigger.click();
  await page.keyboard.press('Home');
  const publicOption = visibilityMenu.getByRole('radio', { name: '공개', exact: true });
  await expect(publicOption).toBeFocused();
  await page.keyboard.press('Space');
  await expect(visibilityMenu).toHaveCount(0);
  await expect(composer.getByRole('button', { name: '공개 범위: 공개' })).toBeFocused();

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
  await expect(page.getByRole('dialog', { name: '글쓰기' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/home$/);

  await page.goto('/@e2e-composer');
  await expect(page.getByText(body)).toBeVisible();
});

test('기본 공개 범위 저장부터 Local 재선택까지 production wiring을 유지한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Production Wiring',
    handle: 'e2e-production-wiring',
  });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/settings/default-post-visibility');
  const visibilityControl = page.getByTestId('profile-default-post-visibility-control');
  const publicOption = visibilityControl.getByRole('radio', {
    name: '공개: 모두가 볼 수 있어요.',
  });
  const saveButton = visibilityControl.getByRole('button', {
    name: '기본 게시 공개 범위 저장',
  });

  await publicOption.click();
  await expect(saveButton).toBeEnabled();
  const settingsMutationResponse = waitForGraphQLOperation(
    page,
    'ProfileDefaultPostVisibilityControlMutation',
  );
  await saveButton.click();
  const settingsResponse = await settingsMutationResponse;
  const settingsBody = (await settingsResponse.json()) as {
    data?: {
      updateProfile?: {
        profile?: { private?: { defaultPostVisibility?: string | null } | null } | null;
      } | null;
    };
    errors?: unknown[];
  };

  expect(settingsResponse.ok(), JSON.stringify(settingsBody, null, 2)).toBe(true);
  expect(settingsBody.errors, JSON.stringify(settingsBody, null, 2)).toBeUndefined();
  expect(settingsBody.data?.updateProfile?.profile?.private?.defaultPostVisibility).toBe('PUBLIC');
  await expect(visibilityControl.getByText('저장했어요.')).toBeVisible();

  const body = 'E2E production wiring local body';
  await page.goto('/compose');
  const composer = page.getByLabel('게시글 작성', { exact: true });
  const input = composer.getByRole('textbox', { name: '게시물 내용' });
  const submit = composer.getByRole('button', { name: '게시', exact: true });

  await expect(composer.getByRole('button', { name: '공개 범위: 공개' })).toBeVisible();
  await input.fill(body);
  const createPostResponse = waitForGraphQLOperation(page, 'PostComposerCreatePostMutation');
  await submit.click();
  const createResponse = await createPostResponse;
  const createOperation = readGraphQLOperation(createResponse.request().postData());
  const createBody = (await createResponse.json()) as {
    data?: { createPost?: { post?: { id?: string | null } | null } | null };
    errors?: unknown[];
  };

  expect(createResponse.ok(), JSON.stringify(createBody, null, 2)).toBe(true);
  expect(createBody.errors, JSON.stringify(createBody, null, 2)).toBeUndefined();
  expect(createOperation?.variables).toMatchObject({
    input: { bodyText: body, visibility: 'PUBLIC' },
  });
  const createdPostId = createBody.data?.createPost?.post?.id;
  expect(createdPostId).toEqual(expect.any(String));

  const localResponsePromise = waitForGraphQLOperation(page, 'LocalPageQuery');
  await page.goto('/local');
  const localResponse = await localResponsePromise;
  const localBody = (await localResponse.json()) as {
    data?: {
      localTimeline?: {
        edges?: Array<{ node?: { id?: string | null } | null } | null> | null;
      } | null;
    };
    errors?: unknown[];
  };

  expect(localResponse.ok(), JSON.stringify(localBody, null, 2)).toBe(true);
  expect(localBody.errors, JSON.stringify(localBody, null, 2)).toBeUndefined();
  expect(localBody.data?.localTimeline?.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ node: expect.objectContaining({ id: createdPostId }) }),
    ]),
  );
  await expect(page.getByText(body, { exact: true })).toBeVisible();

  const reselectResponsePromise = waitForGraphQLOperation(page, 'LocalPageQuery');
  await page.getByRole('tab', { name: '로컬' }).click();
  const reselectResponse = await reselectResponsePromise;
  const reselectBody = (await reselectResponse.json()) as {
    data?: {
      localTimeline?: {
        edges?: Array<{ node?: { id?: string | null } | null } | null> | null;
      } | null;
    };
    errors?: unknown[];
  };

  expect(reselectResponse.ok(), JSON.stringify(reselectBody, null, 2)).toBe(true);
  expect(reselectBody.errors, JSON.stringify(reselectBody, null, 2)).toBeUndefined();
  expect(reselectBody.data?.localTimeline?.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ node: expect.objectContaining({ id: createdPostId }) }),
    ]),
  );
  await expect(page.getByText(body, { exact: true })).toBeVisible();
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

  let mediaCount = 0;
  const completedMediaIds: string[] = [];
  let createPostVariables: Record<string, unknown> | null = null;
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName === 'PostComposerIssueMediaUploadUrlMutation') {
      mediaCount += 1;
      await route.fulfill({
        body: JSON.stringify({
          data: {
            issueMediaUploadUrl: {
              media: { id: `media-clipboard-e2e-${mediaCount}` },
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
      completedMediaIds.push((operation.variables?.input as { id: string }).id);
      await route.fulfill({
        body: JSON.stringify({
          data: {
            completeMediaUpload: {
              media: { id: (operation.variables?.input as { id: string }).id, state: 'READY' },
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
  const composer = page.getByLabel('게시글 작성', { exact: true });
  const input = composer.getByRole('textbox', { name: '게시물 내용' });
  const submit = composer.getByRole('button', { name: '게시', exact: true });
  await input.fill('기존 본문');
  await input.evaluate((element) => element.setSelectionRange(2, 2));

  await pasteComposerImage(input);

  await expect(input).toHaveValue('기존 본문');
  await expect(input).toHaveJSProperty('selectionStart', 2);
  await expect(composer.getByLabel('첨부 이미지 1, 업로드 완료')).toBeVisible();
  await expect(submit).toBeEnabled();

  const edit = composer.getByRole('button', { name: '첨부 이미지 1 편집', exact: true });
  await edit.click();
  await expect(composer.getByTestId('web-composer-media-editor')).toBeVisible();
  await composer.getByRole('textbox', { name: '이미지 설명' }).fill('보존할 이미지 설명');
  await composer.getByRole('tab', { name: '민감도', exact: true }).click();
  await composer.getByRole('switch', { name: '민감한 이미지' }).check();
  await composer.getByRole('button', { name: '완료', exact: true }).click();
  await expect(edit).toBeFocused();
  await expect(input).toHaveValue('기존 본문');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composer.getByTestId('mobile-fullscreen-composer-candidate')).toBeVisible();
  await pasteComposerImage(input);
  await expect(composer.getByLabel('첨부 이미지 2, 업로드 완료')).toBeVisible();
  const footer = composer.getByTestId('mobile-composer-footer');
  await expect.poll(async () => (await footer.boundingBox())?.y).toBe(844 - 64);

  await edit.click();
  await expect(composer.getByRole('textbox', { name: '이미지 설명' })).toHaveValue(
    '보존할 이미지 설명',
  );
  await page.setViewportSize({ width: 390, height: 320 });
  const altInput = composer.getByRole('textbox', { name: '이미지 설명' });
  await altInput.fill('보존할 이미지 설명');
  await expect(altInput).toBeInViewport();
  await expect(composer.getByRole('button', { name: '완료', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '글쓰기' })).toHaveCount(0);
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composer.getByTestId('mobile-fullscreen-composer-candidate')).toBeVisible();
  await expect(composer.getByTestId('mobile-composer-media-editor')).toHaveCount(0);
  await expect(input).toHaveValue('기존 본문');
  await expect(composer.getByLabel('첨부 이미지 2, 업로드 완료')).toBeVisible();

  const createResponse = waitForGraphQLOperation(page, 'PostComposerCreatePostMutation');
  await submit.click();
  const response = await createResponse;
  expect(response.status()).toBe(200);
  expect(completedMediaIds).toEqual(['media-clipboard-e2e-1', 'media-clipboard-e2e-2']);
  expect(createPostVariables).toMatchObject({
    input: {
      bodyText: '기존 본문',
      media: [
        { altText: '보존할 이미지 설명', mediaId: 'media-clipboard-e2e-1' },
        { altText: null, mediaId: 'media-clipboard-e2e-2' },
      ],
      sensitiveMedia: true,
    },
  });
  await expect(page.getByRole('dialog', { name: '글쓰기' })).toHaveCount(0);
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

  const composer = page.getByLabel('게시글 작성', { exact: true });
  const input = composer.getByRole('textbox', { name: '게시물 내용' });
  const visibilityTrigger = composer.getByRole('button', { name: '공개 범위: 조용한 공개' });

  await input.fill('touch 취소 뒤에도 포커스를 유지하는 본문입니다.');
  await expect(input).toBeFocused();
  const focusedOutline = await input.evaluate((element) => getComputedStyle(element).outline);
  expect(focusedOutline).toContain('solid 2px');

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
    await expect(page.getByRole('radiogroup', { name: '공개 범위 선택' })).toHaveCount(0);
    await expect(input).toHaveCSS('outline', focusedOutline);
  } finally {
    await session.detach();
  }
});
