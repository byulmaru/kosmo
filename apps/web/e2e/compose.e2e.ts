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
  await visibilityTrigger.click();
  const visibilityMenu = page.getByRole('menu', { name: '게시글 공개 설정' });
  await expect(visibilityMenu.getByRole('menuitemradio', { name: /^조용한 공개/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await input.click();
  await expect(visibilityMenu).toHaveCount(0);

  await visibilityTrigger.click();
  await page.keyboard.press('Escape');
  await expect(visibilityMenu).toHaveCount(0);
  await expect(visibilityTrigger).toBeFocused();

  await visibilityTrigger.click();
  await page.keyboard.press('End');
  await expect(visibilityMenu.getByRole('menuitemradio', { name: /^언급한 계정만/ })).toBeFocused();
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
      content: {
        content: [
          { content: [{ text: `  ${body}`, type: 'text' }], type: 'paragraph' },
          { type: 'paragraph' },
          { content: [{ text: 'second line  ', type: 'text' }], type: 'paragraph' },
        ],
        type: 'doc',
      },
      visibility: 'PUBLIC',
    },
  });
  expect(responseBody.data?.createPost?.post?.id).toEqual(expect.any(String));
  await expect(input).toHaveValue('');

  await page.goto('/@e2e-composer');
  await expect(page.getByText(body)).toBeVisible();
});
