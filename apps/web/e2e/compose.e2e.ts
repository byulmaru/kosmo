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
  const viewer = await createE2ESession({
    displayName: 'E2E Composer',
    handle: 'e2e-composer',
  });
  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/compose');

  const composer = page.getByLabel('새 게시글 작성');
  const input = composer.getByRole('textbox', { name: '게시글 본문' });
  const submit = composer.getByRole('button', { name: '게시', exact: true });

  await expect(composer.getByText('@e2e-composer')).toBeVisible();
  await expect(submit).toBeDisabled();
  await input.fill('x'.repeat(501));
  await expect(composer.getByText('-1', { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();

  await input.fill(body);
  await composer.getByRole('button', { name: '조용한 공개' }).click();
  await page.getByRole('radio', { name: '공개', exact: true }).click();

  const mutationResponse = waitForGraphQLOperation(page, 'PostComposerCreatePostMutation');
  await submit.click();
  const response = await mutationResponse;
  const operation = readGraphQLOperation(response.request().postData());
  const responseBody = (await response.json()) as {
    data?: { createPost?: { post?: { id?: string | null } | null } | null };
  };

  expect(operation?.operationName).toBe('PostComposerCreatePostMutation');
  expect(operation?.variables).toMatchObject({ input: { visibility: 'PUBLIC' } });
  expect(JSON.stringify(operation?.variables)).toContain(body);
  expect(responseBody.data?.createPost?.post?.id).toEqual(expect.any(String));
  await expect(input).toHaveValue('');

  await page.goto('/@e2e-composer');
  await expect(page.getByText(body)).toBeVisible();
});
