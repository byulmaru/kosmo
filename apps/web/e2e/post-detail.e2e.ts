import { PostVisibility } from '@kosmo/core/enums';
import {
  createE2EFollow,
  createE2EPost,
  createE2EProfile,
  createE2ERemoteProfile,
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

const expectGraphQLSuccess = async (response: Awaited<ReturnType<Page['waitForResponse']>>) => {
  const body = (await response.json()) as { errors?: unknown[] };
  expect(response.ok(), JSON.stringify(body, null, 2)).toBe(true);
  expect(body.errors, JSON.stringify(body, null, 2)).toBeUndefined();
};

const expectNoHorizontalOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
};

const postArticle = (page: Page, body: string) =>
  page.getByRole('article').filter({ hasText: body }).first();

const postActionBar = (page: Page, body: string) =>
  postArticle(page, body).getByRole('toolbar', { name: '액션 바' });

test('현재 Light 정책의 실제 게시글 액션은 Home·Local·Profile·상세와 Web 3폭에서 같은 상태를 유지한다', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);

  const body = 'E2E cross-route bookmark body';
  const viewer = await createE2ESession({
    displayName: 'E2E Cross Route Viewer',
    handle: 'e2e-cross-route-viewer',
  });
  const author = await createE2EProfile({
    displayName: 'E2E Cross Route Author',
    handle: 'e2e-cross-route-author',
  });
  const post = await createE2EPost({
    body,
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });
  const postId = toGlobalId('Post', post.id);
  const relativeHandle = `@${author.handle}`;
  const detailPath = `/${relativeHandle}/${postId}`;

  await createE2EFollow({
    followerProfileId: viewer.profile!.id,
    followeeProfileId: author.id,
  });
  await setE2ESessionCookie(context, viewer.token);

  const routes = [
    { path: '/home', query: 'HomePageQuery' },
    { path: '/local', query: 'LocalPageQuery' },
    { path: `/${relativeHandle}`, query: 'ProfilePostListPageQuery' },
    { path: detailPath, query: 'PostDetailQuery' },
    { path: '/bookmarks', query: 'BookmarksPageQuery' },
  ] as const;
  const widths = [390, 1024, 1440] as const;
  let bookmarked = false;
  let checkedMoreMenu = false;

  await page.emulateMedia({ colorScheme: 'light' });

  for (const width of widths) {
    await page.setViewportSize({ height: 844, width });

    for (const route of routes) {
      const queryResponse = waitForGraphQLOperation(page, route.query);
      await page.goto(route.path);
      await expectGraphQLSuccess(await queryResponse);

      const article = postArticle(page, body);
      const actionBar = postActionBar(page, body);
      const bookmark = article.getByRole('button', { name: /북마크/ });
      await expect(article).toBeVisible();
      await expect(actionBar).toBeVisible();
      await expect(bookmark).toHaveAttribute('aria-pressed', String(bookmarked));
      await expectNoHorizontalOverflow(page);

      if (!checkedMoreMenu) {
        const url = page.url();
        await article.getByRole('button', { name: '더 보기' }).focus();
        await page.keyboard.press('Enter');
        const menu = page.getByRole('menu', { name: '더 보기 메뉴' });
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('menuitem', { name: '링크 복사' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(article.getByRole('button', { name: '더 보기' })).toBeFocused();
        expect(page.url()).toBe(url);
        checkedMoreMenu = true;
      }

      if (!bookmarked) {
        const createResponse = waitForGraphQLOperation(
          page,
          'PostBookmarkActionCreateBookmarkMutation',
        );
        const url = page.url();
        await bookmark.click();
        await expectGraphQLSuccess(await createResponse);
        await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
        expect(page.url()).toBe(url);
        bookmarked = true;
      }
    }
  }
});

test('실제 북마크 목록은 GraphQL 삭제 오류에서 상태를 보존하고 재시도 성공 후 제거한다', async ({
  context,
  page,
}) => {
  const body = 'E2E bookmark retry body';
  const viewer = await createE2ESession({
    displayName: 'E2E Bookmark Retry Viewer',
    handle: 'e2e-bookmark-retry-viewer',
  });
  const author = await createE2EProfile({
    displayName: 'E2E Bookmark Retry Author',
    handle: 'e2e-bookmark-retry-author',
  });
  await createE2EPost({
    body,
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });

  await createE2EFollow({
    followerProfileId: viewer.profile!.id,
    followeeProfileId: author.id,
  });
  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/home');
  const homeArticle = postArticle(page, body);
  const createResponse = waitForGraphQLOperation(page, 'PostBookmarkActionCreateBookmarkMutation');
  await homeArticle.getByRole('button', { name: '북마크' }).click();
  await expectGraphQLSuccess(await createResponse);
  await expect(homeArticle.getByRole('button', { name: '북마크 취소' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const bookmarksQuery = waitForGraphQLOperation(page, 'BookmarksPageQuery');
  await page.goto('/bookmarks');
  await expectGraphQLSuccess(await bookmarksQuery);
  const savedArticle = postArticle(page, body);
  await expect(savedArticle).toBeVisible();
  await expect(savedArticle.getByRole('button', { name: '북마크 취소' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  let failDelete = true;
  await page.route('**/graphql', async (route) => {
    if (
      failDelete &&
      isGraphQLOperation(route.request().postData(), 'PostBookmarkActionDeleteBookmarkMutation')
    ) {
      failDelete = false;
      await route.fulfill({
        body: JSON.stringify({
          data: { deleteBookmark: null },
          errors: [{ message: 'E2E bookmark delete failed' }],
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }

    await route.continue();
  });

  const failedDeleteResponse = waitForGraphQLOperation(
    page,
    'PostBookmarkActionDeleteBookmarkMutation',
  );
  await savedArticle.getByRole('button', { name: '북마크 취소' }).click();
  const failedDeleteBody = (await (await failedDeleteResponse).json()) as {
    errors?: Array<{ message?: string }>;
  };
  expect(failedDeleteBody.errors?.[0]?.message).toBe('E2E bookmark delete failed');
  await expect(page.getByRole('alert')).toContainText('북마크를 취소하지 못했습니다');
  await expect(savedArticle).toBeVisible();
  await expect(savedArticle.getByRole('button', { name: '북마크 취소' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const retryDeleteResponse = waitForGraphQLOperation(
    page,
    'PostBookmarkActionDeleteBookmarkMutation',
  );
  await savedArticle.getByRole('button', { name: '북마크 취소' }).click();
  await expectGraphQLSuccess(await retryDeleteResponse);
  await expect(savedArticle).toHaveCount(0);

  const revisitQuery = waitForGraphQLOperation(page, 'BookmarksPageQuery');
  await page.goto('/bookmarks');
  await expectGraphQLSuccess(await revisitQuery);
  await expect(postArticle(page, body)).toHaveCount(0);
  await expect(page.getByText('아직 북마크가 없어요')).toBeVisible();
  await expect(page).toHaveURL(/\/bookmarks$/);
});

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
