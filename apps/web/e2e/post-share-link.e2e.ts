import { PostVisibility } from '@kosmo/core/enums';
import {
  createE2EPost,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { toGlobalId } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('Web 링크 복사는 configured origin보다 현재 browser origin을 우선한다', async ({
  context,
  page,
}) => {
  const body = 'E2E browser-origin share body';
  const viewer = await createE2ESession({
    displayName: 'E2E Browser Origin Viewer',
    handle: 'e2e-browser-origin-viewer',
  });
  const post = await createE2EPost({
    body,
    profileId: viewer.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const postId = toGlobalId('Post', post.id);
  const expectedPath = `/@${viewer.profile!.handle}/${postId}`;

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/home?source=e2e#ignored');

  const postRow = page.getByTestId('post-list-standard-row').filter({ hasText: body });
  await postRow.getByRole('button', { name: '더 보기' }).click();
  await page
    .getByRole('menu', { name: '더 보기 메뉴' })
    .getByRole('menuitem', { name: '링크 복사' })
    .click();

  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${expectedPath}`);
});
