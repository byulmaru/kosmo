import { db, Profiles } from '@kosmo/core/db';
import { ProfileFollowPolicy } from '@kosmo/core/enums';
import { executeProfileFollowPairTransition } from '@kosmo/core/temporal/follow-command';
import { eq } from 'drizzle-orm';
import {
  createE2EAccountProfile,
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation, waitForGraphQLOperation } from './graphql';
import type { Locator, Page } from '@playwright/test';

const recentSearchesKey = 'kosmo:recent-searches';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test.use({ hasTouch: true });

async function signIn(page: Page, handle = 'e2e-navigation-scroll') {
  const session = await createE2ESession({ handle });
  await setE2ESessionCookie(page.context(), session.token);
  return session;
}

async function selectProfileFromSwitcher(page: Page, handle: string) {
  const response = waitForGraphQLOperation(page, 'ProfileSwitcherSelectProfileMutation');

  await page.getByRole('button', { name: '프로필 목록' }).first().click();
  await page
    .getByLabel('전환할 프로필 목록')
    .getByRole('button')
    .filter({ hasText: `@${handle}` })
    .click();
  await response;
  await expect(page.getByRole('progressbar')).toHaveCount(0);
}

const homeEntrySurfaces = [
  { name: 'full sidebar', viewport: { height: 360, width: 1440 }, kind: 'navigation' },
  { name: 'compact rail', viewport: { height: 360, width: 1024 }, kind: 'navigation' },
  { name: 'mobile bottom tab', viewport: { height: 360, width: 390 }, kind: 'navigation' },
  { name: 'mobile drawer', viewport: { height: 360, width: 390 }, kind: 'drawer' },
  { name: 'full Home header', viewport: { height: 360, width: 1440 }, kind: 'header' },
  { name: 'compact Home header', viewport: { height: 360, width: 1024 }, kind: 'header' },
  { name: 'mobile Home header', viewport: { height: 360, width: 390 }, kind: 'header' },
] as const;

async function visiblePrimaryNavigation(page: Page): Promise<Locator> {
  const navigations = page.getByRole('navigation', { name: '주요 메뉴' });
  await expect(navigations.first()).toBeAttached();

  for (const navigation of await navigations.all()) {
    if (await navigation.isVisible()) {
      return navigation;
    }
  }

  throw new Error('Visible primary navigation was not found.');
}

async function homeEntry(
  page: Page,
  kind: (typeof homeEntrySurfaces)[number]['kind'],
): Promise<Locator> {
  if (kind === 'drawer') {
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    return page
      .locator('#mobile-sidebar')
      .getByRole('navigation', { name: '주요 메뉴' })
      .getByRole('link', { name: '홈', exact: true });
  }
  if (kind === 'header') {
    return page
      .getByRole('heading', { name: '홈' })
      .locator('..')
      .getByRole('link', { name: '홈', exact: true });
  }
  return (await visiblePrimaryNavigation(page)).getByRole('link', {
    name: '홈',
    exact: true,
  });
}

async function scrollDocument(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
}

async function waitAnimationFrames(page: Page, count = 4) {
  await page.evaluate((frameCount) => {
    return new Promise<void>((resolve) => {
      let completed = 0;
      const tick = () => {
        completed += 1;
        if (completed >= frameCount) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, count);
}

test('Web Home forward 진입점은 다른 route에서 /home으로 이동하고 document top을 복원한다', async ({
  page,
}) => {
  const session = await signIn(page, 'e2e-home-reselection-forward');
  for (let index = 0; index < 16; index += 1) {
    await createE2EPost({
      body: `E2E Home reselection post ${index} ${'긴 본문 '.repeat(20)}`,
      profileId: session.profile!.id,
    });
  }

  for (const surface of homeEntrySurfaces.filter(({ kind }) => kind !== 'header')) {
    await page.setViewportSize(surface.viewport);
    await page.goto('/compose');
    await expect(page.getByRole('textbox', { name: '게시글 본문' }).first()).toBeVisible();
    await scrollDocument(page);

    const entry = await homeEntry(page, surface.kind);
    await expect(entry).toHaveAttribute('href', '/home');
    if (surface.name === 'mobile bottom tab' || surface.name === 'mobile drawer') {
      await entry.tap();
    } else {
      await entry.click();
    }
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText('E2E Home reselection post 0')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  }
});

for (const [index, surface] of homeEntrySurfaces.entries()) {
  test(`current Home 재선택은 ${surface.name}에서 scroll top과 단일 refresh를 수행한다`, async ({
    page,
  }) => {
    const session = await signIn(page, `e2e-home-reselection-current-${index}`);
    for (let postIndex = 0; postIndex < 16; postIndex += 1) {
      await createE2EPost({
        body: `E2E Home reselection post ${postIndex} ${'긴 본문 '.repeat(20)}`,
        profileId: session.profile!.id,
      });
    }

    await page.setViewportSize(surface.viewport);
    await page.goto('/home');
    await expect(page.getByText('E2E Home reselection post 0')).toBeVisible();
    await scrollDocument(page);

    let refreshCount = 0;
    await page.route('**/graphql', async (route) => {
      if (isGraphQLOperation(route.request().postData(), 'HomePageQuery')) {
        refreshCount += 1;
      }
      await route.continue();
    });
    const homeRefreshResponse = waitForGraphQLOperation(page, 'HomePageQuery');

    try {
      const entry = await homeEntry(page, surface.kind);
      await expect(entry).toHaveAttribute('href', '/home');
      if (surface.name === 'mobile Home header') {
        await entry.focus();
        await expect(entry).toBeFocused();
        await page.keyboard.press('Enter');
      } else if (surface.name === 'mobile bottom tab' || surface.name === 'mobile drawer') {
        await entry.tap();
      } else {
        await entry.click();
      }

      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect.poll(() => refreshCount).toBe(1);
      await homeRefreshResponse;
    } finally {
      await page.unroute('**/graphql');
    }
  });
}

test('no-data Home 오류는 current Home 재선택으로 단일 query를 다시 시작하고 복구한다', async ({
  page,
}) => {
  const session = await signIn(page, 'e2e-home-reselection-no-data');
  const postBody = 'E2E Home no-data reselection recovery';
  await createE2EPost({ body: postBody, profileId: session.profile!.id });

  let homeQueryCount = 0;
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'HomePageQuery')) {
      await route.continue();
      return;
    }

    homeQueryCount += 1;
    if (homeQueryCount === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  try {
    await page.setViewportSize({ height: 360, width: 1440 });
    await page.goto('/home');
    await expect(page.getByRole('alert')).toContainText('홈을 불러오지 못했어요');

    await (
      await visiblePrimaryNavigation(page)
    )
      .getByRole('link', {
        name: '홈',
        exact: true,
      })
      .click();

    await expect.poll(() => homeQueryCount).toBe(2);
    await expect(page.getByText(postBody)).toBeVisible();
  } finally {
    await page.unroute('**/graphql');
  }
});

test('no-data Home blocking retry는 오류를 한 번 보고하고 HomePageQuery 한 번으로 복구한다', async ({
  page,
}) => {
  const session = await signIn(page, 'e2e-home-reselection-no-data-retry');
  const postBody = 'E2E Home no-data retry recovery';
  const reportedRouteErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Route error')) {
      reportedRouteErrors.push(message.text());
    }
  });
  await createE2EPost({ body: postBody, profileId: session.profile!.id });

  let homeQueryCount = 0;
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'HomePageQuery')) {
      await route.continue();
      return;
    }

    homeQueryCount += 1;
    if (homeQueryCount === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  try {
    await page.setViewportSize({ height: 360, width: 1440 });
    await page.goto('/home');
    await expect(page.getByRole('alert')).toContainText('홈을 불러오지 못했어요');
    await expect.poll(() => reportedRouteErrors.length).toBe(1);

    const homeQueryResponse = waitForGraphQLOperation(page, 'HomePageQuery');
    await page.getByRole('button', { name: '다시 시도' }).click();
    await homeQueryResponse;
    await expect.poll(() => homeQueryCount).toBe(2);
    await expect(page.getByText(postBody)).toBeVisible();
  } finally {
    await page.unroute('**/graphql');
  }
});

test('1280px full shell은 document overflow 전후 컬럼 경계와 600px 중앙 폭을 유지한다', async ({
  page,
}) => {
  await signIn(page, 'e2e-navigation-shell-geometry');
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto('/notifications');
  await expect(page.getByText('아직 알림이 없어요')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter))
    .toBe('stable');

  const root = page.getByTestId('universal-shell-root');
  const columns = root.locator(':scope > div');
  await expect(columns).toHaveCount(3);

  const shortDocumentGeometry = await columns.evaluateAll((elements) =>
    elements.map((element) => {
      const { left, right, width } = element.getBoundingClientRect();
      return { left, right, width };
    }),
  );
  await page.evaluate(() => {
    const overflow = document.createElement('div');
    overflow.style.height = '200vh';
    document.body.append(overflow);
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight))
    .toBe(true);

  const overflowDocumentGeometry = await columns.evaluateAll((elements) =>
    elements.map((element) => {
      const { left, right, width } = element.getBoundingClientRect();
      return { left, right, width };
    }),
  );
  expect(overflowDocumentGeometry).toEqual(shortDocumentGeometry);
  expect(shortDocumentGeometry[1]?.width).toBe(600);
});

test('팔로워 요청 진입점은 full, compact와 mobile drawer에서 canonical route를 연다', async ({
  page,
}) => {
  await signIn(page, 'e2e-follow-request-navigation');

  for (const viewport of [
    { height: 720, width: 1440 },
    { height: 720, width: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/home');
    const navigation = await visiblePrimaryNavigation(page);
    const link = navigation.getByRole('link', { name: '팔로워 요청', exact: true });
    await expect(link).toHaveAttribute('href', '/follow-requests');
    await expect(navigation.locator('a[href="/menu"]')).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(/\/follow-requests$/);
    await expect(page.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
    await expect(
      (await visiblePrimaryNavigation(page)).getByRole('link', {
        name: '팔로워 요청',
        exact: true,
      }),
    ).toHaveAttribute('aria-current', 'page');
  }

  await page.setViewportSize({ height: 720, width: 390 });
  await page.goto('/home');
  await expect(
    (await visiblePrimaryNavigation(page)).getByRole('link', {
      name: '팔로워 요청',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  const drawer = page.locator('#mobile-sidebar');
  const drawerNavigation = drawer.getByRole('navigation', { name: '주요 메뉴' });
  const drawerLink = drawerNavigation.getByRole('link', {
    name: '팔로워 요청',
    exact: true,
  });
  await expect(drawerLink).toHaveAttribute('href', '/follow-requests');
  await expect(drawerNavigation.locator('a[href="/menu"]')).toHaveCount(0);
  await drawerLink.tap();
  await expect(page).toHaveURL(/\/follow-requests$/);
  await expect(page.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
  await expect(drawer).toHaveCount(0);
});

test('사이드바 Profile 요약의 편집 action은 canonical route를 연다', async ({ page }) => {
  await signIn(page, 'e2e-profile-edit-navigation');

  await page.setViewportSize({ height: 720, width: 1440 });
  await page.goto('/home');
  const activeProfile = page.getByLabel('활성 프로필', { exact: true });
  const navigation = await visiblePrimaryNavigation(page);
  const profileEdit = activeProfile.getByRole('link', {
    name: '프로필 편집',
    exact: true,
  });
  await expect(profileEdit).toHaveAttribute('href', '/profile-edit');
  await expect(profileEdit.getByText('편집', { exact: true })).toBeVisible();
  await expect(navigation.getByRole('link', { name: '프로필 편집', exact: true })).toHaveCount(0);
  const activeProfileBounds = await activeProfile.boundingBox();
  const profileEditBounds = await profileEdit.boundingBox();
  expect(activeProfileBounds).not.toBeNull();
  expect(profileEditBounds).not.toBeNull();
  expect(profileEditBounds!.width).toBe(72);
  expect(profileEditBounds!.height).toBe(32);
  expect(profileEditBounds!.y - activeProfileBounds!.y).toBe(158);
  expect(activeProfileBounds!.x + activeProfileBounds!.width - profileEditBounds!.x - 72).toBe(20);

  await profileEdit.focus();
  await expect(profileEdit).toBeFocused();
  await profileEdit.press('Enter');
  await expect(page).toHaveURL(/\/profile-edit$/);
  await expect(page.getByRole('heading', { name: '프로필 수정', exact: true })).toBeVisible();
  await expect(
    page
      .getByLabel('활성 프로필', { exact: true })
      .getByRole('link', { name: '프로필 편집', exact: true }),
  ).toHaveAttribute('aria-current', 'page');

  await page.setViewportSize({ height: 720, width: 1024 });
  await page.goto('/home');
  await expect(page.getByRole('link', { name: '프로필 편집', exact: true })).toHaveCount(0);

  await page.setViewportSize({ height: 720, width: 390 });
  await page.goto('/home');
  const bottomNavigation = await visiblePrimaryNavigation(page);
  await expect(
    bottomNavigation.getByRole('link', { name: '프로필 편집', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '메뉴 열기' }).click();

  const drawer = page.locator('#mobile-sidebar');
  const drawerNavigation = drawer.getByRole('navigation', { name: '주요 메뉴' });
  const drawerProfile = drawer.getByLabel('활성 프로필', { exact: true });
  const drawerProfileEdit = drawerProfile.getByRole('link', {
    name: '프로필 편집',
    exact: true,
  });
  await expect(drawerProfileEdit).toHaveAttribute('href', '/profile-edit');
  await expect(
    drawerNavigation.getByRole('link', { name: '프로필 편집', exact: true }),
  ).toHaveCount(0);
  const drawerProfileEditBounds = await drawerProfileEdit.boundingBox();
  expect(drawerProfileEditBounds).not.toBeNull();
  expect(drawerProfileEditBounds!.height).toBe(32);
  expect(drawerProfileEditBounds!.width).toBe(72);

  await drawerProfileEdit.focus();
  await expect(drawerProfileEdit).toBeFocused();
  await drawerProfileEdit.press('Enter');
  await expect(page).toHaveURL(/\/profile-edit$/);
  await expect(page.getByRole('heading', { name: '프로필 수정', exact: true })).toBeVisible();
  await expect(drawer).toHaveCount(0);

  await page.getByRole('button', { name: '메뉴 열기' }).click();
  const currentDrawer = page.locator('#mobile-sidebar');
  await expect(
    currentDrawer
      .getByLabel('활성 프로필', { exact: true })
      .getByRole('link', { name: '프로필 편집', exact: true }),
  ).toHaveAttribute('aria-current', 'page');

  await page.goto('/home');
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  const touchDrawer = page.locator('#mobile-sidebar');
  await touchDrawer
    .getByLabel('활성 프로필', { exact: true })
    .getByRole('link', { name: '프로필 편집', exact: true })
    .tap();
  await expect(page).toHaveURL(/\/profile-edit$/);
  await expect(page.getByRole('heading', { name: '프로필 수정', exact: true })).toBeVisible();
  await expect(touchDrawer).toHaveCount(0);
});

test('팔로워 요청 route는 navigation 진입 뒤 selected Profile별 승인·거절을 격리한다', async ({
  context,
  page,
}) => {
  const recipient = await createE2ESession({
    displayName: 'Recipient A',
    handle: 'e2e-follow-request-recipient-a',
  });
  const recipientB = await createE2EAccountProfile({
    accountId: recipient.account.id,
    displayName: 'Recipient B',
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    handle: 'e2e-follow-request-recipient-b',
  });
  const followerA = await createE2ESession({
    displayName: 'Follower A',
    handle: 'e2e-follow-request-follower-a',
  });
  const followerB = await createE2ESession({
    displayName: 'Follower B',
    handle: 'e2e-follow-request-follower-b',
  });

  await db
    .update(Profiles)
    .set({ followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED })
    .where(eq(Profiles.id, recipient.profile!.id));

  const requestA = await executeProfileFollowPairTransition({
    pair: {
      followeeProfileId: recipient.profile!.id,
      followerProfileId: followerA.profile!.id,
    },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  const requestB = await executeProfileFollowPairTransition({
    pair: { followeeProfileId: recipientB.id, followerProfileId: followerB.profile!.id },
    command: {
      kind: 'FOLLOW',
      origin: 'LOCAL',
    },
  });
  expect(requestA.result.commandKind).toBe('FOLLOW');
  expect(requestB.result.commandKind).toBe('FOLLOW');
  if (requestA.result.commandKind !== 'FOLLOW' || requestB.result.commandKind !== 'FOLLOW') {
    throw new Error('Expected Follow transitions');
  }
  expect(requestA.result.kind).toBe('PENDING');
  expect(requestB.result.kind).toBe('PENDING');

  await setE2ESessionCookie(context, recipient.token);
  await page.setViewportSize({ height: 720, width: 1440 });
  await page.goto('/home');
  await (await visiblePrimaryNavigation(page))
    .getByRole('link', { name: '팔로워 요청', exact: true })
    .click();

  await expect(page).toHaveURL(/\/follow-requests$/);
  await expect(page.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
  const followerALink = page.getByRole('link', { name: 'Follower A 프로필로 이동' });
  await expect(followerALink).toBeVisible();
  await expect(page.getByRole('link', { name: 'Follower B 프로필로 이동' })).toHaveCount(0);

  await selectProfileFromSwitcher(page, recipientB.handle);
  await expect(page.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
  const followerBLink = page.getByRole('link', { name: 'Follower B 프로필로 이동' });
  await expect(followerBLink).toBeVisible();
  await expect(page.getByRole('link', { name: 'Follower A 프로필로 이동' })).toHaveCount(0);

  const approveButton = page.getByRole('button', {
    name: 'Follower B 팔로우 요청 승인',
  });
  const rejectBButton = page.getByRole('button', {
    name: 'Follower B 팔로우 요청 거절',
  });
  await followerBLink.focus();
  await page.keyboard.press('Tab');
  await expect(approveButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rejectBButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(approveButton).toBeFocused();

  const approveResponse = waitForGraphQLOperation(page, 'FollowRequestListItemApproveMutation');
  await page.keyboard.press('Enter');
  await approveResponse;
  await expect(approveButton).toHaveCount(0);
  await expect(followerBLink).toHaveCount(0);

  await selectProfileFromSwitcher(page, recipient.profile!.handle);
  await expect(followerALink).toBeVisible();
  await expect(page.getByRole('link', { name: 'Follower B 프로필로 이동' })).toHaveCount(0);

  const rejectButton = page.getByRole('button', {
    name: 'Follower A 팔로우 요청 거절',
  });
  await rejectButton.focus();
  await expect(rejectButton).toBeFocused();
  const rejectResponse = waitForGraphQLOperation(page, 'FollowRequestListItemRejectMutation');
  await page.keyboard.press('Enter');
  await rejectResponse;
  await expect(rejectButton).toHaveCount(0);
  await expect(followerALink).toHaveCount(0);
});

test('loading target도 pathname commit 직후 이전 document offset을 노출하지 않는다', async ({
  page,
}) => {
  await signIn(page, 'e2e-navigation-loading');
  await page.setViewportSize({ height: 360, width: 1440 });
  await page.goto('/compose');
  await expect(page.getByRole('textbox', { name: '게시글 본문' }).first()).toBeVisible();
  await scrollDocument(page);

  let releaseHomeQuery!: () => void;
  let resolveHomeQueryStarted!: () => void;
  let resolveHomeQueryHandled!: () => void;
  const homeQueryStarted = new Promise<void>((resolve) => {
    resolveHomeQueryStarted = resolve;
  });
  const homeQueryHandled = new Promise<void>((resolve) => {
    resolveHomeQueryHandled = resolve;
  });
  const homeQueryRelease = new Promise<void>((resolve) => {
    releaseHomeQuery = resolve;
  });

  await page.route('**/graphql', async (route) => {
    if (isGraphQLOperation(route.request().postData(), 'HomePageQuery')) {
      resolveHomeQueryStarted();
      const response = await route.fetch();
      await homeQueryRelease;
      await route.fulfill({ response });
      resolveHomeQueryHandled();
      return;
    }
    await route.continue();
  });

  try {
    const navigation = await visiblePrimaryNavigation(page);
    await navigation.getByRole('link', { name: '홈', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await homeQueryStarted;
    await expect(page.getByText('홈을 불러오는 중입니다.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await navigation.getByRole('link', { name: '알림', exact: true }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByText('아직 알림이 없어요')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  } finally {
    releaseHomeQuery();
    await homeQueryHandled;
    await page.unroute('**/graphql');
  }
});

test('current Home refresh는 in-flight 중복을 막고 settle 뒤 다음 activation을 허용한다', async ({
  page,
}) => {
  const session = await signIn(page, 'e2e-home-reselection-in-flight');
  for (let index = 0; index < 16; index += 1) {
    await createE2EPost({
      body: `E2E Home reselection post ${index} ${'긴 본문 '.repeat(20)}`,
      profileId: session.profile!.id,
    });
  }

  await page.setViewportSize({ height: 360, width: 1440 });
  await page.goto('/home');
  await expect(page.getByText('E2E Home reselection post 0')).toBeVisible();
  await scrollDocument(page);

  let releaseFirstHomeRefresh = () => undefined;
  let resolveHomeQueryStarted!: () => void;
  let resolveFirstHomeRefreshFulfilled!: () => void;
  let resolveSecondHomeRefreshFulfilled!: () => void;
  const homeQueryStarted = new Promise<void>((resolve) => {
    resolveHomeQueryStarted = resolve;
  });
  const firstHomeRefreshFulfilled = new Promise<void>((resolve) => {
    resolveFirstHomeRefreshFulfilled = resolve;
  });
  const secondHomeRefreshFulfilled = new Promise<void>((resolve) => {
    resolveSecondHomeRefreshFulfilled = resolve;
  });
  const homeQueryRelease = new Promise<void>((resolve) => {
    releaseFirstHomeRefresh = resolve;
  });
  let refreshCount = 0;

  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'HomePageQuery')) {
      await route.continue();
      return;
    }
    refreshCount += 1;
    const requestCount = refreshCount;
    const response = await route.fetch();
    if (requestCount === 1) {
      resolveHomeQueryStarted();
      await homeQueryRelease;
    }
    await route.fulfill({ response });
    if (requestCount === 1) {
      resolveFirstHomeRefreshFulfilled();
    } else if (requestCount === 2) {
      resolveSecondHomeRefreshFulfilled();
    }
  });

  const entry = await homeEntry(page, 'navigation');
  try {
    await entry.click();
    await homeQueryStarted;
    await entry.click();
    await expect.poll(() => refreshCount).toBe(1);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    releaseFirstHomeRefresh();
    await firstHomeRefreshFulfilled;
    await expect
      .poll(async () => {
        await entry.click();
        return refreshCount;
      })
      .toBe(2);
    await secondHomeRefreshFulfilled;
  } finally {
    releaseFirstHomeRefresh();
    await page.unroute('**/graphql');
  }
});

test('current Home refresh error는 timeline을 유지하고 다음 activation에서 재시도한다', async ({
  page,
}) => {
  const session = await signIn(page, 'e2e-home-reselection-error');
  for (let index = 0; index < 16; index += 1) {
    await createE2EPost({
      body: `E2E Home reselection post ${index} ${'긴 본문 '.repeat(20)}`,
      profileId: session.profile!.id,
    });
  }

  await page.setViewportSize({ height: 360, width: 1440 });
  await page.goto('/home');
  await expect(page.getByText('E2E Home reselection post 0')).toBeVisible();
  await scrollDocument(page);

  let refreshCount = 0;
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'HomePageQuery')) {
      await route.continue();
      return;
    }
    refreshCount += 1;
    await route.abort('failed');
  });

  const entry = await homeEntry(page, 'navigation');
  try {
    await entry.click();
    await expect.poll(() => refreshCount).toBe(1);
    await expect(page.getByText('E2E Home reselection post 0')).toBeVisible();
    await page.setViewportSize({ height: 360, width: 1024 });
    await expect(page.getByText('E2E Home reselection post 0')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const rerenderedEntry = await homeEntry(page, 'navigation');
    await expect
      .poll(async () => {
        await rerenderedEntry.click();
        return refreshCount;
      })
      .toBe(2);
    await expect(page.getByText('E2E Home reselection post 0')).toBeVisible();
  } finally {
    await page.unroute('**/graphql');
  }
});

test('search query-only 이동은 document scroll과 입력 focus를 보존하고 history traversal을 reset하지 않는다', async ({
  page,
}) => {
  const session = await signIn(page, 'e2e-navigation-search');
  const firstQueryProfiles = Array.from({ length: 20 }, (_, index) => `e2e-query-first-${index}`);
  const secondQueryProfiles = Array.from({ length: 20 }, (_, index) => `e2e-query-second-${index}`);

  for (const handle of [...firstQueryProfiles, ...secondQueryProfiles]) {
    await createE2EProfile({ handle });
  }
  for (let index = 0; index < 20; index += 1) {
    await createE2EPost({
      body: `E2E navigation history post ${index} ${'긴 본문 '.repeat(20)}`,
      profileId: session.profile!.id,
    });
  }

  await page.setViewportSize({ height: 360, width: 1440 });
  await page.addInitScript(
    ({ storageKey }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify([
          'e2e-query-second',
          ...Array.from({ length: 20 }, (_, index) => `e2e-recent-${index}`),
        ]),
      );
    },
    { storageKey: recentSearchesKey },
  );
  await page.goto('/search?q=e2e-query-first&tab=people');
  const input = page.getByRole('textbox', { name: '검색어' });
  await expect(input).toBeVisible();
  await expect(page.getByRole('link', { name: /e2e-query-first-0/ })).toBeVisible();
  await input.focus();
  await expect(page.getByRole('link', { name: 'e2e-query-second', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'e2e-query-second', exact: true }).click();

  await expect(page).toHaveURL(/q=e2e-query-second/);
  await expect(page.getByRole('link', { name: /e2e-query-second-0/ })).toBeVisible();
  const offsetBeforeWheel = await page.evaluate(() => {
    const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(320, maxScrollY));
    return window.scrollY;
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(offsetBeforeWheel);
  await waitAnimationFrames(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(offsetBeforeWheel);
  await expect(input).toBeFocused();

  await page.getByRole('link', { name: '뒤로', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?tab=people$/);
  await expect(page.getByText('프로필을 검색해보세요')).toBeVisible();
  await expect(page.getByRole('link', { name: 'e2e-query-second', exact: true })).not.toBeVisible();
  await expect(input).not.toBeFocused();

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible();
  await scrollDocument(page);
  const homeScroll = await page.evaluate(() => window.scrollY);
  await (await visiblePrimaryNavigation(page))
    .getByRole('link', { name: '검색', exact: true })
    .click();
  await expect(page).toHaveURL(/\/search$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(homeScroll);

  await page.goto('/search?q=e2e-query-first&tab=people');
  const repeatedQueryInput = page.getByRole('textbox', { name: '검색어' });
  await expect(repeatedQueryInput).toBeVisible();
  await expect(page.getByRole('link', { name: /e2e-query-first-0/ })).toBeVisible();
  await repeatedQueryInput.focus();
  const historyLengthBeforeSameQuery = await page.evaluate(() => window.history.length);
  await repeatedQueryInput.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.history.length))
    .toBe(historyLengthBeforeSameQuery);

  await repeatedQueryInput.fill('e2e-query-second');
  await repeatedQueryInput.press('Enter');
  await expect(page).toHaveURL(/q=e2e-query-second/);
  await expect(page.getByRole('link', { name: /e2e-query-second-0/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/q=e2e-query-first/);
  await expect(page.getByRole('link', { name: /e2e-query-first-0/ })).toBeVisible();
  await waitAnimationFrames(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
