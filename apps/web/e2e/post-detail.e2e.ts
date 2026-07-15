import { PostVisibility } from '@kosmo/core/enums';
import {
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import {
  isGraphQLOperation,
  readGraphQLOperation,
  toGlobalId,
  waitForGraphQLOperation,
} from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('게시글 목록에서 상세로 이동하고 뒤로 가며 deep-link handle을 정규화한다', async ({
  context,
  page,
}) => {
  const body = 'E2E post detail body';
  const viewer = await createE2ESession({
    displayName: 'E2E Detail Viewer',
    handle: 'e2e-detail-viewer',
  });
  const post = await createE2EPost({
    body,
    profileId: viewer.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const postId = toGlobalId('Post', post.id);
  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/home');

  const detailResponse = waitForGraphQLOperation(page, 'PostDetailQuery');
  await page.getByRole('link', { name: body }).click();
  const response = await detailResponse;
  const operation = readGraphQLOperation(response.request().postData());

  expect(operation?.operationName).toBe('PostDetailQuery');
  expect(operation?.variables).toMatchObject({ postId });
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(`/@${viewer.profile!.handle}/${postId}`);
  await expect(page.getByText('게시글', { exact: true }).last()).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();
  await expect(page.getByText(/전체 공개$/)).toBeVisible();

  await page.getByRole('button', { name: '뒤로 가기' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(body)).toBeVisible();

  await page.goto(`/@wrong-handle/${postId}`);
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(`/@${viewer.profile!.handle}/${postId}`);
  await expect(page.getByText(body)).toBeVisible();
});

test('연합 프로필 게시글은 relativeHandle URL을 유지하고 정규화한다', async ({ context, page }) => {
  const body = 'E2E federated post detail body';
  const viewer = await createE2ESession({ handle: 'e2e-federated-detail-viewer' });
  const author = await createE2EProfile({ handle: 'e2e-federated-author' });
  const post = await createE2EPost({
    body,
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });
  const postId = toGlobalId('Post', post.id);
  const relativeHandle = `@${author.handle}@remote.example`;

  await setE2ESessionCookie(context, viewer.token);
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'PostDetailQuery')) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const responseBody = (await response.json()) as {
      data?: { node?: { profile?: { relativeHandle: string } | null } | null };
    };
    const profile = responseBody.data?.node?.profile;

    if (profile) {
      profile.relativeHandle = relativeHandle;
    }

    await route.fulfill({
      body: JSON.stringify(responseBody),
      contentType: 'application/json',
      status: response.status(),
    });
  });

  const canonicalPath = `/${relativeHandle}/${postId}`;

  await page.goto(canonicalPath);
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(canonicalPath);
  await expect(page.getByText(body)).toBeVisible();

  await page.goto(`/@wrong-handle/${postId}`);
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(canonicalPath);
  await expect(page.getByText(body)).toBeVisible();
});
