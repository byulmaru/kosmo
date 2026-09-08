import {
  Bookmarks,
  db,
  Notifications,
  Posts,
  ProfileFollows,
  ProfileMutes,
  Reactions,
} from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq } from 'drizzle-orm';
import {
  createE2EAccountProfile,
  createE2EFollow,
  createE2EPost,
  createE2EProfile,
  createE2EProfileMute,
  createE2ERemoteProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation, waitForGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('Local·Remote Profile을 UI에서 Mute하고 Profile·Settings에서 확인 후 해제한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({
    displayName: 'E2E Mute Viewer',
    handle: 'e2e-mute-viewer',
  });
  const localTarget = await createE2EProfile({
    displayName: 'E2E Local Mute Target',
    handle: 'e2e-local-mute-target',
  });
  const remoteDomain = 'e2e-mute-target.remote.example';
  const remoteTarget = await createE2ERemoteProfile({
    displayName: 'E2E Remote Mute Target',
    domain: remoteDomain,
    handle: 'e2e-remote-mute-target',
    instanceState: 'UNRESPONSIVE',
  });

  await setE2ESessionCookie(context, viewer.token);

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/@${localTarget.handle}`);
  await muteFromProfile(page, localTarget.displayName, { checkFocus: true });
  expect(
    await db.$count(
      ProfileMutes,
      and(
        eq(ProfileMutes.ownerProfileId, viewer.profile!.id),
        eq(ProfileMutes.targetProfileId, localTarget.id),
      ),
    ),
  ).toBe(1);
  await expect
    .poll(async () =>
      db
        .select({ expiresAt: ProfileMutes.expiresAt })
        .from(ProfileMutes)
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, viewer.profile!.id),
            eq(ProfileMutes.targetProfileId, localTarget.id),
          ),
        ),
    )
    .toEqual([{ expiresAt: null }]);
  await expect(page.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toBeVisible();

  const directUnmuteResponse = waitForGraphQLOperation(page, 'ProfileMuteControllerUnmuteMutation');
  await page.getByRole('button', { name: '뮤트 해제', exact: true }).click();
  await confirmUnmute(page);
  await directUnmuteResponse;
  await expect(page.getByRole('alert')).toContainText(
    'E2E Local Mute Target 님이 뮤트 해제되었어요',
  );
  await expect(page.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toHaveCount(0);
  await expect(page.locator(`a[href="/@${localTarget.handle}/following"]`)).toBeFocused();
  expect(
    await db.$count(
      ProfileMutes,
      and(
        eq(ProfileMutes.ownerProfileId, viewer.profile!.id),
        eq(ProfileMutes.targetProfileId, localTarget.id),
      ),
    ),
  ).toBe(0);

  await page.setViewportSize({ height: 844, width: 1024 });
  await page.goto(`/@${remoteTarget.handle}@${remoteDomain}`);
  await muteFromProfile(page, remoteTarget.displayName);
  await expect(page.getByRole('button', { name: '더보기' })).toBeVisible();
  await page.getByRole('button', { name: '더보기' }).click();
  await expect(page.getByRole('menuitem', { name: '뮤트 해제' })).toBeVisible();

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/settings/mute-and-block');
  await page.getByRole('link', { name: '뮤트한 프로필 관리 열기' }).click();
  await expect(page).toHaveURL(/\/settings\/muted-profiles$/u);
  await expect(
    page.getByRole('button', { name: 'E2E Remote Mute Target 뮤트 해제' }),
  ).toBeVisible();

  const settingsUnmuteResponse = waitForGraphQLOperation(
    page,
    'ProfileMuteControllerUnmuteMutation',
  );
  await page.getByRole('button', { name: 'E2E Remote Mute Target 뮤트 해제' }).click();
  await confirmUnmute(page);
  await settingsUnmuteResponse;
  await expect(page.getByRole('alert')).toContainText(
    'E2E Remote Mute Target 님이 뮤트 해제되었어요',
  );
  await expect(page.getByRole('button', { name: 'E2E Remote Mute Target 뮤트 해제' })).toHaveCount(
    0,
  );
  await expect(page.getByTestId('muted-profile-list')).toBeFocused();
  expect(
    await db.$count(
      ProfileMutes,
      and(
        eq(ProfileMutes.ownerProfileId, viewer.profile!.id),
        eq(ProfileMutes.targetProfileId, remoteTarget.id),
      ),
    ),
  ).toBe(0);
});

test('Mute 확인은 keyboard focus를 보장하고 pending 중 닫힘·중복 요청을 막는다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ handle: 'e2e-mute-pending-viewer' });
  const target = await createE2EProfile({
    displayName: 'E2E Mute Pending Target',
    handle: 'e2e-mute-pending-target',
  });
  await setE2ESessionCookie(context, viewer.token);

  let releaseMutation!: () => void;
  const mutationGate = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });
  let mutationCount = 0;
  await page.route('**/graphql', async (route) => {
    if (isGraphQLOperation(route.request().postData(), 'ProfileMuteControllerMuteMutation')) {
      mutationCount += 1;
      await mutationGate;
    }
    await route.fallback();
  });

  await page.goto(`/@${target.handle}`);
  await openMuteConfirmation(page);
  const dialog = page.getByRole('dialog', { name: '이 프로필을 뮤트할까요?' }).last();
  const confirm = dialog.getByRole('button', { name: '뮤트', exact: true });
  const cancel = dialog.getByRole('button', { name: '취소', exact: true });
  await expect(cancel).toBeFocused();

  await confirm.click();
  await expect(confirm).toHaveAttribute('aria-busy', 'true');
  await expect(cancel).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await confirm.click({ force: true });
  expect(mutationCount).toBe(1);

  releaseMutation();
  await expect(page.getByRole('alert')).toContainText('E2E Mute Pending Target 님이 뮤트되었어요');
  await expect(dialog).toHaveCount(0);
  expect(
    await db.$count(
      ProfileMutes,
      and(
        eq(ProfileMutes.ownerProfileId, viewer.profile!.id),
        eq(ProfileMutes.targetProfileId, target.id),
      ),
    ),
  ).toBe(1);
});

test('Mute mutation 실패는 서버 확정 상태를 바꾸지 않고 다시 시도할 수 있다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ handle: 'e2e-mute-failure-viewer' });
  const target = await createE2EProfile({
    displayName: 'E2E Mute Failure Target',
    handle: 'e2e-mute-failure-target',
  });
  await setE2ESessionCookie(context, viewer.token);

  let mutationAttempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'ProfileMuteControllerMuteMutation')) {
      await route.fallback();
      return;
    }

    mutationAttempts += 1;
    if (mutationAttempts > 1) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      body: JSON.stringify({ errors: [{ message: 'E2E forced mute failure' }] }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto(`/@${target.handle}`);
  await openMuteConfirmation(page);
  const dialog = page.getByRole('dialog', { name: '이 프로필을 뮤트할까요?' }).last();
  await dialog.getByRole('button', { name: '뮤트', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('뮤트하지 못했어요. 다시 시도해 주세요.');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '더보기', exact: true })).toBeFocused();
  await expect(page.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toHaveCount(0);
  await openMuteConfirmation(page);
  const retryDialog = page.getByRole('dialog', { name: '이 프로필을 뮤트할까요?' }).last();
  const retryResponse = waitForGraphQLOperation(page, 'ProfileMuteControllerMuteMutation');
  await retryDialog.getByRole('button', { name: '뮤트', exact: true }).click();
  await retryResponse;
  await expect(page.getByRole('alert')).toContainText('E2E Mute Failure Target 님이 뮤트되었어요');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toBeVisible();
  expect(
    await db.$count(
      ProfileMutes,
      and(
        eq(ProfileMutes.ownerProfileId, viewer.profile!.id),
        eq(ProfileMutes.targetProfileId, target.id),
      ),
    ),
  ).toBe(1);
});

test('Home·Local은 muted outer/source Author의 Post·Quote·Repost를 제외하고 직접 Profile은 유지한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ handle: 'e2e-mute-policy-viewer' });
  const mutedSource = await createE2EProfile({
    displayName: 'E2E Muted Source',
    handle: 'e2e-muted-source',
  });
  const mutedOuter = await createE2EProfile({
    displayName: 'E2E Muted Outer',
    handle: 'e2e-muted-outer',
  });
  const visibleOuter = await createE2EProfile({
    displayName: 'E2E Visible Outer',
    handle: 'e2e-visible-outer',
  });
  await Promise.all(
    [mutedSource, mutedOuter, visibleOuter].map((profile) =>
      createE2EFollow({
        followerProfileId: viewer.profile!.id,
        followeeProfileId: profile.id,
      }),
    ),
  );

  const mutedSourcePost = await createE2EPost({
    body: 'E2E muted source direct body',
    profileId: mutedSource.id,
  });
  const visiblePost = await createE2EPost({
    body: 'E2E visible outer direct body',
    profileId: visibleOuter.id,
  });
  await createE2EPost({
    body: 'E2E muted source quote body',
    profileId: visibleOuter.id,
    repostSourceId: mutedSourcePost.id,
  });
  await createE2EPost({
    content: false,
    profileId: visibleOuter.id,
    repostSourceId: mutedSourcePost.id,
  });
  await createE2EPost({
    body: 'E2E muted outer direct body',
    profileId: mutedOuter.id,
  });
  await createE2EPost({
    body: 'E2E muted outer quote body',
    profileId: mutedOuter.id,
    repostSourceId: visiblePost.id,
  });
  await createE2EPost({
    content: false,
    profileId: mutedOuter.id,
    repostSourceId: visiblePost.id,
  });

  await setE2ESessionCookie(context, viewer.token);
  await page.goto(`/@${mutedSource.handle}`);
  await muteFromProfile(page, mutedSource.displayName);
  await page.goto(`/@${mutedOuter.handle}`);
  await muteFromProfile(page, mutedOuter.displayName);

  for (const route of ['/home', '/local']) {
    await page.goto(route);
    await expect(page.getByText('E2E visible outer direct body', { exact: true })).toHaveCount(1);
    for (const hiddenBody of [
      'E2E muted source direct body',
      'E2E muted source quote body',
      'E2E muted outer direct body',
      'E2E muted outer quote body',
    ]) {
      await expect(page.getByText(hiddenBody, { exact: true })).toHaveCount(0);
    }
  }

  await page.goto(`/@${mutedSource.handle}`);
  await expect(page.getByText('E2E muted source direct body', { exact: true })).toBeVisible();
  await expect(page.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toBeVisible();
  await page.goto(`/@${mutedOuter.handle}`);
  await expect(page.getByText('E2E muted outer direct body', { exact: true })).toBeVisible();
});

test('같은 Account의 selected Profile별 Mute를 분리하고 실제 switcher 전환·해제 후 feed를 복구한다', async ({
  context,
  page,
}) => {
  const owner = await createE2ESession({
    displayName: 'E2E Mute Owner A',
    handle: 'e2e-mute-owner-a',
  });
  const secondProfile = await createE2EAccountProfile({
    accountId: owner.account.id,
    displayName: 'E2E Mute Owner B',
    handle: 'e2e-mute-owner-b',
  });
  const target = await createE2EProfile({
    displayName: 'E2E Selected Profile Target',
    handle: 'e2e-selected-profile-target',
  });
  const targetPostBody = 'E2E selected profile mute target body';
  await createE2EPost({ body: targetPostBody, profileId: target.id });
  await createE2EFollow({
    followerProfileId: owner.profile!.id,
    followeeProfileId: target.id,
  });
  await createE2EFollow({
    followerProfileId: secondProfile.id,
    followeeProfileId: target.id,
  });

  await setE2ESessionCookie(context, owner.token);
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible();
  await expect(page.getByText(targetPostBody, { exact: true })).toBeVisible();
  await page.getByRole('tablist', { name: '타임라인' }).getByRole('tab', { name: '로컬' }).click();
  await expect(page).toHaveURL(/\/local$/u);
  await expect(page.getByText(targetPostBody, { exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: `${target.displayName} @${target.handle}`, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/@${target.handle}$`, 'u'));
  await muteFromProfile(page, target.displayName);
  expect(
    await db.$count(
      ProfileMutes,
      and(
        eq(ProfileMutes.ownerProfileId, owner.profile!.id),
        eq(ProfileMutes.targetProfileId, target.id),
      ),
    ),
  ).toBe(1);

  await navigatePrimary(page, '로컬');
  await expect(page).toHaveURL(/\/local$/u);
  await expect(page.getByText(targetPostBody, { exact: true })).toHaveCount(0);
  await selectProfileFromSwitcher(page, secondProfile.handle);
  await expect(page).toHaveURL(/\/local$/u);
  await expect(page.getByText(targetPostBody, { exact: true })).toBeVisible();
  expect(
    await db.$count(
      ProfileMutes,
      and(
        eq(ProfileMutes.ownerProfileId, secondProfile.id),
        eq(ProfileMutes.targetProfileId, target.id),
      ),
    ),
  ).toBe(0);

  await selectProfileFromSwitcher(page, owner.profile!.handle);
  await expect(page.getByText(targetPostBody, { exact: true })).toHaveCount(0);
  await navigatePrimary(page, '홈');
  await expect(page).toHaveURL(/\/home$/u);
  await expect(page.getByText(targetPostBody, { exact: true })).toHaveCount(0);
  await navigatePrimary(page, '설정');
  await expect(page).toHaveURL(/\/settings$/u);
  await page.getByRole('link', { name: '뮤트 및 차단 설정 열기' }).click();
  await expect(page).toHaveURL(/\/settings\/mute-and-block$/u);
  await page.getByRole('link', { name: '뮤트한 프로필 관리 열기' }).click();
  await expect(
    page.getByRole('button', { name: 'E2E Selected Profile Target 뮤트 해제' }),
  ).toBeVisible();
  const unmuteResponse = waitForGraphQLOperation(page, 'ProfileMuteControllerUnmuteMutation');
  await page.getByRole('button', { name: 'E2E Selected Profile Target 뮤트 해제' }).click();
  await confirmUnmute(page);
  await unmuteResponse;
  await expect(
    page.getByRole('button', { name: 'E2E Selected Profile Target 뮤트 해제' }),
  ).toHaveCount(0);
  await navigatePrimary(page, '홈');
  await expect(page).toHaveURL(/\/home$/u);
  await expect(page.getByText(targetPostBody, { exact: true })).toBeVisible();
  await navigatePrimary(page, '로컬');
  await expect(page).toHaveURL(/\/local$/u);
  await expect(page.getByText(targetPostBody, { exact: true })).toBeVisible();
  expect(
    await db.$count(
      ProfileMutes,
      and(
        eq(ProfileMutes.ownerProfileId, owner.profile!.id),
        eq(ProfileMutes.targetProfileId, target.id),
      ),
    ),
  ).toBe(0);
});

test('Settings Mute 목록은 pagination 실패를 retry하고 다음 page를 연결한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ handle: 'e2e-mute-pagination-viewer' });
  const targets = await Promise.all(
    Array.from({ length: 21 }, (_, index) =>
      createE2EProfile({
        displayName: `E2E Pagination Mute ${index.toString().padStart(2, '0')}`,
        handle: `e2e-pagination-mute-${index.toString().padStart(2, '0')}`,
      }),
    ),
  );
  await Promise.all(
    targets.map((target) =>
      createE2EProfileMute({ ownerProfileId: viewer.profile!.id, targetProfileId: target.id }),
    ),
  );
  await setE2ESessionCookie(context, viewer.token);

  let nextPageAttempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'SettingsMutedProfilesNextPageQuery')) {
      await route.fallback();
      return;
    }

    nextPageAttempts += 1;
    if (nextPageAttempts === 1) {
      await route.fulfill({
        body: JSON.stringify({ errors: [{ message: 'E2E forced mute pagination failure' }] }),
        contentType: 'application/json',
        status: 500,
      });
      return;
    }
    await route.fallback();
  });

  await page.setViewportSize({ height: 800, width: 1024 });
  await page.goto('/settings/mute-and-block');
  await page.getByRole('link', { name: '뮤트한 프로필 관리 열기' }).click();
  const rows = page.getByRole('button', { name: /E2E Pagination Mute \d{2} 뮤트 해제/u });
  await expect(rows).toHaveCount(20);
  await page.getByRole('button', { name: '더 불러오기' }).click();
  await expect(page.getByRole('alert')).toContainText('프로필을 더 불러오지 못했어요');
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect.poll(() => nextPageAttempts).toBe(2);
  await expect(rows).toHaveCount(21);
  await expect(page.getByText('E2E Pagination Mute 20', { exact: true })).toBeVisible();
});

test('Mute Settings의 초기 오류는 retry 뒤 실제 목록을 로드한다', async ({ context, page }) => {
  const viewer = await createE2ESession({ handle: 'e2e-mute-settings-error-viewer' });
  const target = await createE2EProfile({
    displayName: 'E2E Settings Error Target',
    handle: 'e2e-settings-error-target',
  });
  await createE2EProfileMute({ ownerProfileId: viewer.profile!.id, targetProfileId: target.id });
  await setE2ESessionCookie(context, viewer.token);

  let queryAttempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'SettingsMutedProfilesQuery')) {
      await route.fallback();
      return;
    }

    queryAttempts += 1;
    if (queryAttempts === 1) {
      await route.fulfill({
        body: JSON.stringify({ errors: [{ message: 'E2E forced mute settings failure' }] }),
        contentType: 'application/json',
        status: 500,
      });
      return;
    }
    await route.fallback();
  });

  await page.goto('/settings/mute-and-block');
  await page.getByRole('link', { name: '뮤트한 프로필 관리 열기' }).click();
  await expect(page.getByRole('alert')).toContainText('뮤트한 프로필을 불러오지 못했어요');
  await page.getByRole('alert').getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect.poll(() => queryAttempts).toBe(2);
  await expect(page.getByText('E2E Settings Error Target', { exact: true })).toBeVisible();
});

test('Mute·unmute 전후 Follow·Reaction·Bookmark·Repost와 Notification read state가 보존된다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ handle: 'e2e-mute-invariants-viewer' });
  const target = await createE2EProfile({
    displayName: 'E2E Mute Invariant Target',
    handle: 'e2e-mute-invariant-target',
  });
  const targetPost = await createE2EPost({
    body: 'E2E invariant target body',
    profileId: target.id,
  });
  const follow = await createE2EFollow({
    followerProfileId: viewer.profile!.id,
    followeeProfileId: target.id,
  });
  const repost = await createE2EPost({
    content: false,
    profileId: viewer.profile!.id,
    repostSourceId: targetPost.id,
  });
  const reaction = await db
    .insert(Reactions)
    .values({ profileId: viewer.profile!.id, postId: targetPost.id, type: 'LIKE' })
    .returning()
    .then(([row]) => row!);
  const bookmark = await db
    .insert(Bookmarks)
    .values({ profileId: viewer.profile!.id, postId: targetPost.id })
    .returning()
    .then(([row]) => row!);
  const notification = await db
    .insert(Notifications)
    .values({
      kind: NotificationKind.FOLLOW,
      readAt: null,
      recipientProfileId: viewer.profile!.id,
      sourceId: follow.id,
    })
    .returning()
    .then(([row]) => row!);

  const snapshot = async () => ({
    bookmark: await db
      .select({ id: Bookmarks.id, postId: Bookmarks.postId, profileId: Bookmarks.profileId })
      .from(Bookmarks)
      .where(eq(Bookmarks.id, bookmark.id)),
    follow: await db
      .select({
        followerProfileId: ProfileFollows.followerProfileId,
        followeeProfileId: ProfileFollows.followeeProfileId,
        id: ProfileFollows.id,
      })
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, follow.id)),
    notification: await db
      .select({
        id: Notifications.id,
        kind: Notifications.kind,
        readAt: Notifications.readAt,
        recipientProfileId: Notifications.recipientProfileId,
        sourceId: Notifications.sourceId,
      })
      .from(Notifications)
      .where(eq(Notifications.id, notification.id))
      .then((rows) => rows.map((row) => ({ ...row, readAt: row.readAt?.toString() ?? null }))),
    reaction: await db
      .select({ id: Reactions.id, postId: Reactions.postId, profileId: Reactions.profileId })
      .from(Reactions)
      .where(eq(Reactions.id, reaction.id)),
    repost: await db
      .select({ id: Posts.id, profileId: Posts.profileId, repostSourceId: Posts.repostSourceId })
      .from(Posts)
      .where(eq(Posts.id, repost.id)),
  });

  const before = await snapshot();
  await setE2ESessionCookie(context, viewer.token);
  await page.goto(`/@${target.handle}`);
  await muteFromProfile(page, target.displayName);
  const unmuteResponse = waitForGraphQLOperation(page, 'ProfileMuteControllerUnmuteMutation');
  await page.getByRole('button', { name: '뮤트 해제', exact: true }).click();
  await confirmUnmute(page);
  await unmuteResponse;
  await expect(page.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toHaveCount(0);
  expect(await snapshot()).toEqual(before);
});

async function confirmUnmute(page: Page) {
  const dialog = page.getByRole('dialog', { name: '이 프로필을 뮤트 해제할까요?' }).last();
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '뮤트 해제', exact: true }).click();
}

async function openMuteConfirmation(page: Page) {
  await page.getByRole('button', { name: '더보기' }).click();
  await page.getByRole('menu', { name: '더보기' }).getByRole('menuitem', { name: '뮤트' }).click();
  await expect(page.getByRole('dialog', { name: '이 프로필을 뮤트할까요?' }).last()).toBeVisible();
}

async function muteFromProfile(
  page: Page,
  displayName: string,
  options: { checkFocus?: boolean } = {},
) {
  await openMuteConfirmation(page);
  const dialog = page.getByRole('dialog', { name: '이 프로필을 뮤트할까요?' }).last();
  if (options.checkFocus) {
    await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  }
  const response = waitForGraphQLOperation(page, 'ProfileMuteControllerMuteMutation');
  await dialog.getByRole('button', { name: '뮤트', exact: true }).click();
  await response;
  await expect(page.getByRole('alert')).toContainText(`${displayName} 님이 뮤트되었어요`);
  await expect(page.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toBeVisible();
}

async function selectProfileFromSwitcher(page: Page, handle: string) {
  await page.getByRole('button', { name: '프로필 목록' }).first().click();
  await expect(page.getByLabel('프로필 전환')).toBeVisible();
  const response = waitForGraphQLOperation(page, 'ProfileSwitcherSelectProfileMutation');
  await page
    .getByLabel('전환할 프로필 목록')
    .getByRole('button')
    .filter({ hasText: `@${handle}` })
    .click();
  await response;
  await expect(page.getByRole('progressbar')).toHaveCount(0);
}

async function navigatePrimary(page: Page, label: string) {
  const navigations = page.getByRole('navigation', { name: '주요 메뉴' });

  if (label === '로컬') {
    for (const navigation of await navigations.all()) {
      if (await navigation.isVisible()) {
        await navigation.getByRole('link', { name: '홈', exact: true }).click();
        break;
      }
    }

    await expect(page).toHaveURL(/\/home$/u);
    const timelineTabs = page.getByRole('tablist', { name: '타임라인' });
    await timelineTabs.getByRole('tab', { name: '로컬', exact: true }).click();
    await expect(page).toHaveURL(/\/local$/u);
    return;
  }

  for (const navigation of await navigations.all()) {
    if (await navigation.isVisible()) {
      await navigation.getByRole('link', { name: label, exact: true }).click();
      return;
    }
  }

  throw new Error(`Visible primary navigation does not contain ${label}`);
}
