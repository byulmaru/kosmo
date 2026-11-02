import { createE2EPost, createE2EProfile, resetE2EDatabase } from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, waitForGraphQLOperation } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

for (const partial of [false, true]) {
  test(`${partial ? 'following에서 복귀' : 'cold 직접 진입'}는 프로필과 게시글을 한 번에 조회한다`, async ({
    page,
  }) => {
    const profile = await createE2EProfile({
      displayName: 'E2E Single Profile',
      handle: 'e2e-single-profile',
    });
    const postBody = 'E2E single profile post';
    await createE2EPost({ body: postBody, profileId: profile.id });
    if (partial) {
      const response = waitForGraphQLOperation(page, 'ProfileScreenQuery');
      await page.goto(`/@${profile.handle}/following`);
      await response;
      await expect(page.getByText('아직 팔로잉이 없어요', { exact: true })).toBeVisible();
    }
    const started = deferred();
    const release = deferred();
    let count = 0;
    await page.route('**/graphql', async (route) => {
      const operation = readGraphQLOperation(route.request().postData());
      if (operation?.operationName === 'ProfileScreenQuery') {
        count++;
        expect(operation.variables).toMatchObject({
          posts: true,
          followers: false,
          following: false,
        });
        const response = await route.fetch();
        started.resolve();
        await release.promise;
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });
    let navigation: Promise<unknown> | undefined;
    try {
      navigation = partial
        ? page.getByRole('button', { name: '프로필로 돌아가기', exact: true }).click()
        : page.goto(`/@${profile.handle}`);
      await started.promise;
      const header = page.getByRole('heading', { name: profile.displayName, exact: true });
      if (partial) {
        await expect(header).toBeVisible();
      } else {
        await expect(header).toHaveCount(0);
      }
      await expect(page.getByText(postBody, { exact: true })).toHaveCount(0);
      release.resolve();
      await navigation;
      await expect(header).toBeVisible();
      await expect(page.getByText(postBody, { exact: true })).toBeVisible();
      expect(count).toBe(1);
    } finally {
      release.resolve();
      await navigation?.catch(() => undefined);
    }
  });
}

for (const kind of ['followers', 'following'] as const) {
  test(`${kind} 직접 진입은 게시글을 제외하고 해당 관계를 조회한다`, async ({ page }) => {
    const profile = await createE2EProfile({
      displayName: 'E2E Connection',
      handle: 'e2e-connection',
    });
    const response = waitForGraphQLOperation(page, 'ProfileScreenQuery');
    await page.goto(`/@${profile.handle}/${kind}`);
    const result = await response;
    expect(readGraphQLOperation(result.request().postData())?.variables).toMatchObject({
      posts: false,
      [kind]: true,
    });
    const body = await result.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.profileByHandle).not.toHaveProperty('posts');
    await expect(
      page.getByRole('heading', {
        name: `E2E Connection님의 ${kind === 'followers' ? '팔로워' : '팔로잉'}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(kind === 'followers' ? '아직 팔로워가 없어요' : '아직 팔로잉이 없어요', {
        exact: true,
      }),
    ).toBeVisible();
  });
}

test('partial cache 조회 실패는 화면 전체 오류로 전환하고 전체 재시도로 복구한다', async ({
  page,
}) => {
  const profile = await createE2EProfile({
    displayName: 'E2E Retry Profile',
    handle: 'e2e-retry-profile',
  });
  const postBody = 'E2E retried profile post';
  await createE2EPost({ body: postBody, profileId: profile.id });
  let count = 0;
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName === 'ProfileScreenQuery' && operation.variables?.posts === true) {
      count++;
      if (count === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'E2E profile failure' }] }),
        });
        return;
      }
    }
    await route.continue();
  });
  await page.goto(`/@${profile.handle}/following`);
  await expect(page.getByText('아직 팔로잉이 없어요', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '프로필로 돌아가기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('프로필을 불러오지 못했어요');
  await expect(page.getByRole('heading', { name: profile.displayName, exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText(postBody, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.getByRole('heading', { name: profile.displayName, exact: true })).toBeVisible();
  await expect(page.getByText(postBody, { exact: true })).toBeVisible();
  expect(count).toBe(2);
});
