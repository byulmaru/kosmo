import { createE2EFollow, createE2EPost, createE2EProfile, resetE2EDatabase } from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, waitForGraphQLOperation } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('cold 직접 프로필 진입은 posts 응답이 먼저 와도 header 완료 전 목록을 표시하지 않는다', async ({
  page,
}) => {
  const profile = await createE2EProfile({
    displayName: 'E2E Profile Request Order',
    handle: 'e2e-profile-request-order',
  });
  const postBody = 'E2E profile request order post';
  await createE2EPost({
    body: postBody,
    profileId: profile.id,
  });

  const layoutStarted = deferred();
  const postsStarted = deferred();
  const postsCompleted = deferred();
  const releaseLayout = deferred();
  await page.route('**/graphql', async (route) => {
    const operationName = readGraphQLOperation(route.request().postData())?.operationName;
    if (operationName === 'ProfileLayoutQuery') {
      layoutStarted.resolve();
      const response = await route.fetch();
      await releaseLayout.promise;
      await route.fulfill({ response });
      return;
    }
    if (operationName === 'ProfilePostListPageQuery') {
      postsStarted.resolve();
      const response = await route.fetch();
      await route.fulfill({ response });
      postsCompleted.resolve();
      return;
    }
    await route.continue();
  });

  const profileHeading = page.getByRole('heading', { name: profile.displayName, exact: true });
  const postLocator = page.getByText(postBody, { exact: true });
  let navigation: Promise<unknown> | undefined;
  try {
    navigation = page.goto(`/@${profile.handle}`);
    await layoutStarted.promise;
    await postsStarted.promise;
    await postsCompleted.promise;
    await expect(profileHeading).toHaveCount(0);
    await expect(postLocator).toHaveCount(0);

    releaseLayout.resolve();
    await expect(profileHeading).toBeVisible();
    await navigation;
    await expect(postLocator).toBeVisible();
  } finally {
    releaseLayout.resolve();
    await navigation?.catch(() => undefined);
    await page.unroute('**/graphql');
  }
});

test('following에서 프로필로 client navigation해도 header 응답 전에 posts 요청을 시작한다', async ({
  page,
}) => {
  const profile = await createE2EProfile({
    displayName: 'E2E Client Navigation Profile',
    handle: 'e2e-client-navigation-profile',
  });
  const followedProfile = await createE2EProfile({
    displayName: 'E2E Client Navigation Followed',
    handle: 'e2e-client-navigation-followed',
  });
  const postBody = 'E2E client navigation profile post';
  await createE2EPost({
    body: postBody,
    profileId: profile.id,
  });
  await createE2EFollow({
    followeeProfileId: followedProfile.id,
    followerProfileId: profile.id,
  });

  const followingResponse = waitForGraphQLOperation(page, 'ProfileFollowingPageQuery');
  await page.goto(`/@${profile.handle}/following`);
  const response = await followingResponse;
  expect(response.ok()).toBe(true);
  expect((await response.json()).errors).toBeUndefined();
  await expect(
    page.getByRole('heading', { name: `${profile.displayName}님의 팔로잉`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(followedProfile.displayName, { exact: true })).toBeVisible();

  const layoutStarted = deferred();
  const postsStarted = deferred();
  const releaseLayout = deferred();
  await page.route('**/graphql', async (route) => {
    const operationName = readGraphQLOperation(route.request().postData())?.operationName;
    if (operationName === 'ProfileLayoutQuery') {
      layoutStarted.resolve();
      const response = await route.fetch();
      await releaseLayout.promise;
      await route.fulfill({ response });
      return;
    }
    if (operationName === 'ProfilePostListPageQuery') {
      postsStarted.resolve();
    }
    await route.continue();
  });

  const profileHeading = page.getByRole('heading', { name: profile.displayName, exact: true });
  const postLocator = page.getByText(postBody, { exact: true });
  let navigation: Promise<unknown> | undefined;
  try {
    navigation = page.getByRole('button', { name: '프로필로 돌아가기', exact: true }).click();
    await layoutStarted.promise;
    await postsStarted.promise;
    releaseLayout.resolve();
    await navigation;
    await expect(profileHeading).toBeVisible();
    await expect(postLocator).toBeVisible();
  } finally {
    releaseLayout.resolve();
    await navigation?.catch(() => undefined);
    await page.unroute('**/graphql');
  }
});

for (const connection of [
  {
    emptyTitle: '아직 팔로워가 없어요',
    kind: 'followers',
    operationName: 'ProfileFollowersPageQuery',
  },
  {
    emptyTitle: '아직 팔로잉이 없어요',
    kind: 'following',
    operationName: 'ProfileFollowingPageQuery',
  },
] as const) {
  test(`${connection.kind} 직접 진입은 connection query만 완료하고 posts query를 시작하지 않는다`, async ({
    page,
  }) => {
    const profile = await createE2EProfile({
      displayName: `E2E ${connection.kind} Request Order`,
      handle: `e2e-${connection.kind}-request-order`,
    });
    const operationNames: string[] = [];
    page.on('request', (request) => {
      const operationName = readGraphQLOperation(request.postData())?.operationName;
      if (operationName) {
        operationNames.push(operationName);
      }
    });

    const connectionResponse = waitForGraphQLOperation(page, connection.operationName);
    await page.goto(`/@${profile.handle}/${connection.kind}`);
    const response = await connectionResponse;
    expect(response.ok()).toBe(true);
    expect((await response.json()).errors).toBeUndefined();
    await expect(
      page.getByRole('heading', {
        name: `${profile.displayName}님의 ${connection.kind === 'followers' ? '팔로워' : '팔로잉'}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(connection.emptyTitle, { exact: true })).toBeVisible();
    expect(operationNames).not.toContain('ProfilePostListPageQuery');
  });
}
