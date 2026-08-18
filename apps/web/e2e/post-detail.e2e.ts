import { PostVisibility } from '@kosmo/core/enums';
import {
  createE2EPost,
  createE2ERemoteProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, toGlobalId, waitForGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

const gotoPostDetail = async (page: Page, path: string) => {
  const detailResponse = waitForGraphQLOperation(page, 'PostDetailQuery');
  await page.goto(path);

  const response = await detailResponse;
  const body = (await response.json()) as { errors?: unknown[] };
  expect(response.ok(), JSON.stringify(body, null, 2)).toBe(true);
  expect(body.errors, JSON.stringify(body, null, 2)).toBeUndefined();
};

test('게시글 목록에서 상세로 이동하고 뒤로 가며 deep-link handle을 정규화한다', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
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
  await page.getByTestId('post-list-row-body').filter({ hasText: body }).click();
  const response = await detailResponse;
  const operation = readGraphQLOperation(response.request().postData());

  expect(operation?.operationName).toBe('PostDetailQuery');
  expect(operation?.variables).toMatchObject({ postId });
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(`/@${viewer.profile!.handle}/${postId}`);
  const heading = page.getByRole('heading', { name: '게시글' });
  await expect(heading).toBeVisible();
  await expect.poll(async () => (await heading.locator('..').boundingBox())?.height).toBe(64);
  await expect(page.getByRole('button', { name: '메뉴 열기' })).toHaveCount(0);
  await expect(page.getByText(body)).toBeVisible();
  await expect(page.getByText(/전체 공개$/)).toBeVisible();

  await page.getByRole('button', { name: '뒤로 가기' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(body)).toBeVisible();

  await page.goto(`/wrong-handle/${postId}`);
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(`/@${viewer.profile!.handle}/${postId}`);
  await expect(page.getByText(body)).toBeVisible();
});

test('연합 프로필 게시글은 relativeHandle URL을 유지하고 정규화한다', async ({ context, page }) => {
  const body = 'E2E federated post detail body';
  const viewer = await createE2ESession({ handle: 'e2e-federated-detail-viewer' });
  const domain = 'remote.example';
  const author = await createE2ERemoteProfile({ domain, handle: 'e2e-federated-author' });
  const post = await createE2EPost({
    body,
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });
  const postId = toGlobalId('Post', post.id);
  const relativeHandle = `@${author.handle}@${domain}`;

  await setE2ESessionCookie(context, viewer.token);

  const canonicalPath = `/${relativeHandle}/${postId}`;

  await gotoPostDetail(page, canonicalPath);
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(canonicalPath);
  await expect(page.getByText(body)).toBeVisible();

  await gotoPostDetail(page, `/wrong-handle/${postId}`);
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(canonicalPath);
  await expect(page.getByText(body)).toBeVisible();
});

test('Child Reply 상세의 Parent inline Reply geometry를 320px까지 유지한다', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  const parentBody = 'E2E parent reply body';
  const childBody = 'E2E child reply body';
  const viewer = await createE2ESession({
    displayName: 'E2E Reply Thread Viewer',
    handle: 'e2e-reply-thread-viewer',
  });
  const parent = await createE2EPost({
    body: parentBody,
    profileId: viewer.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const child = await createE2EPost({
    body: childBody,
    profileId: viewer.profile!.id,
    replyParentId: parent.id,
    visibility: PostVisibility.PUBLIC,
  });
  const parentId = toGlobalId('Post', parent.id);
  const childId = toGlobalId('Post', child.id);

  await setE2ESessionCookie(context, viewer.token);
  const detailResponse = waitForGraphQLOperation(page, 'PostDetailQuery');
  await page.goto(`/@${viewer.profile!.handle}/${childId}`);
  await detailResponse;
  await expect(page.getByText(childBody)).toBeVisible();

  const parentRow = page.getByTestId(`post-thread-item-${parentId}`);
  await expect(parentRow).toBeVisible();
  await parentRow.getByRole('button', { name: '답글' }).click();

  const parentComposer = parentRow.getByLabel('답글 작성');
  const parentConnector = page.getByTestId(`post-thread-connector-${parentId}-${childId}-after`);
  await expect(parentComposer).toBeVisible();
  await expect(parentConnector).toBeVisible();

  const [parentRowBox, parentComposerBox, parentConnectorBox] = await Promise.all([
    parentRow.boundingBox(),
    parentComposer.boundingBox(),
    parentConnector.boundingBox(),
  ]);
  expect(parentRowBox).not.toBeNull();
  expect(parentComposerBox).not.toBeNull();
  expect(parentConnectorBox).not.toBeNull();
  expect(parentComposerBox!.x - parentRowBox!.x).toBe(64);
  expect(
    parentRowBox!.x + parentRowBox!.width - (parentComposerBox!.x + parentComposerBox!.width),
  ).toBe(8);
  expect(parentConnectorBox!.x + parentConnectorBox!.width).toBeLessThan(parentComposerBox!.x);

  await page.setViewportSize({ height: 844, width: 320 });
  await parentComposer.getByRole('button', { name: '조용한 공개' }).click();

  const visibilityMenu = parentComposer.getByRole('menu', { name: '답글 공개 설정' });
  await expect(visibilityMenu).toBeVisible();
  const visibilityMenuBox = await visibilityMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(visibilityMenuBox).not.toBeNull();
  expect(visibilityMenuBox?.width).toBe(256);
  expect(viewport).not.toBeNull();
  expect(visibilityMenuBox?.x).toBeGreaterThanOrEqual(0);
  expect(visibilityMenuBox!.x + visibilityMenuBox!.width).toBeLessThanOrEqual(viewport!.width);
});
