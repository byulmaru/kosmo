import {
  createE2EFollow,
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

const minute = 60_000;
const day = 24 * 60 * minute;

function isoAgo(milliseconds: number) {
  return new Date(Date.now() - milliseconds).toISOString();
}

function formatDateLabel(iso: string) {
  return new Date(iso)
    .toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');
}

async function expectPostOrder(page: Page, bodies: string[]) {
  const bodyLinks = page.getByRole('link').filter({ hasText: /^E2E timeline/ });

  await expect(bodyLinks).toHaveCount(bodies.length);
  await expect(bodyLinks).toHaveText(bodies);
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('홈 타임라인은 본인 글과 팔로우한 프로필 글만 최신순으로 보여준다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Timeline Viewer',
    handle: 'e2e-timeline-viewer',
  });
  const followedProfile = await createE2EProfile({
    displayName: 'E2E Followed Writer',
    handle: 'e2e-followed-writer',
  });
  const unfollowedProfile = await createE2EProfile({
    displayName: 'E2E Hidden Writer',
    handle: 'e2e-hidden-writer',
  });
  const viewerPostTime = isoAgo(10 * minute);
  const followedPostTime = isoAgo(2 * minute);
  const oldFollowedPostTime = isoAgo(2 * day);

  await createE2EFollow({
    followerProfileId: viewer.profile!.id,
    followeeProfileId: followedProfile.id,
  });
  await createE2EPost({
    profileId: followedProfile.id,
    body: 'E2E timeline followed old body',
    createdAt: oldFollowedPostTime,
  });
  await createE2EPost({
    profileId: viewer.profile!.id,
    body: 'E2E timeline viewer body',
    createdAt: viewerPostTime,
  });
  await createE2EPost({
    profileId: followedProfile.id,
    body: 'E2E timeline followed latest body',
    createdAt: followedPostTime,
  });
  await createE2EPost({
    profileId: unfollowedProfile.id,
    body: 'E2E timeline hidden body',
    createdAt: isoAgo(minute),
  });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/home');

  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible();
  await expectPostOrder(page, [
    'E2E timeline followed latest body',
    'E2E timeline viewer body',
    'E2E timeline followed old body',
  ]);
  await expect(page.getByText('E2E timeline hidden body')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'E2E Followed Writer @e2e-followed-writer' }),
  ).toHaveCount(2);
  await expect(
    page.getByRole('link', { name: 'E2E Timeline Viewer @e2e-timeline-viewer' }),
  ).toHaveCount(1);
  await expect(page.getByRole('link', { name: /분 전|시간 전|지금/ }).first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: formatDateLabel(oldFollowedPostTime) }),
  ).toBeVisible();
  await expect(page.getByText('게시글 목록을 불러오는 중입니다.')).toHaveCount(0);
  await expect(page.getByText('아직 게시글이 없어요')).toHaveCount(0);
});

test('프로필 게시글 목록은 해당 프로필이 작성한 글만 보여준다', async ({ context, page }) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Profile Viewer',
    handle: 'e2e-profile-viewer',
  });
  const targetProfile = await createE2EProfile({
    displayName: 'E2E Profile Writer',
    handle: 'e2e-profile-writer',
  });

  await createE2EPost({
    profileId: targetProfile.id,
    body: 'E2E timeline profile older body',
    createdAt: isoAgo(90 * minute),
  });
  await createE2EPost({
    profileId: targetProfile.id,
    body: 'E2E timeline profile latest body',
    createdAt: isoAgo(3 * minute),
  });
  await createE2EPost({
    profileId: viewer.profile!.id,
    body: 'E2E timeline other profile body',
    createdAt: isoAgo(minute),
  });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/@e2e-profile-writer');

  await expect(page.getByRole('link', { name: /E2E Profile Writer/ }).first()).toContainText(
    '@e2e-profile-writer',
  );
  await expectPostOrder(page, [
    'E2E timeline profile latest body',
    'E2E timeline profile older body',
  ]);
  await expect(page.getByText('E2E timeline other profile body')).toHaveCount(0);
});

test('게시글이 없는 홈과 프로필 목록은 빈 상태를 보여준다', async ({ context, page }) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Empty Viewer',
    handle: 'e2e-empty-viewer',
  });
  const emptyProfile = await createE2EProfile({
    displayName: 'E2E Empty Profile',
    handle: 'e2e-empty-profile',
  });

  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible();
  await expect(page.getByText('아직 게시글이 없어요')).toBeVisible();

  await page.goto(`/@${emptyProfile.handle}`);
  await expect(page.getByText('아직 게시글이 없어요')).toBeVisible();
});

test('빈 본문과 긴 본문 게시글도 목록 항목으로 렌더한다', async ({ context, page }) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Body Viewer',
    handle: 'e2e-body-viewer',
  });
  const longBody = `E2E timeline long body ${'긴 본문 '.repeat(80)}`;

  await createE2EPost({
    profileId: viewer.profile!.id,
    body: '',
    createdAt: isoAgo(4 * minute),
  });
  await createE2EPost({
    profileId: viewer.profile!.id,
    body: longBody,
    createdAt: isoAgo(2 * minute),
  });
  await setE2ESessionCookie(context, viewer.token);

  await page.goto('/home');

  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByText('E2E timeline long body')).toBeVisible();
  await expect(page.getByRole('link', { name: /E2E Body Viewer/ }).first()).toContainText(
    '@e2e-body-viewer',
  );
});

test('프로필 게시글 목록 오류 상태는 다시 시도를 제공한다', async ({ context, page }) => {
  let profilePostsRequestCount = 0;
  const viewer = await createE2ESession({
    displayName: 'E2E Profile Error Viewer',
    handle: 'e2e-profile-error-viewer',
  });
  const targetProfile = await createE2EProfile({
    displayName: 'E2E Profile Error Target',
    handle: 'e2e-profile-error-target',
  });

  await setE2ESessionCookie(context, viewer.token);
  await page.route('**/graphql', async (route) => {
    if (isGraphQLOperation(route.request().postData(), 'ProfilePostListPageQuery')) {
      profilePostsRequestCount += 1;
      await route.fulfill({
        contentType: 'application/json',
        status: 500,
        body: JSON.stringify({ errors: [{ message: 'E2E forced profile posts error' }] }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto(`/@${targetProfile.handle}`);

  await expect(page.getByRole('alert')).toContainText('게시글 목록을 불러오지 못했어요');
  const previousCount = profilePostsRequestCount;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect.poll(() => profilePostsRequestCount).toBeGreaterThan(previousCount);
});
