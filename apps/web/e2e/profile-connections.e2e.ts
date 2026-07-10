import {
  createE2EFollow,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, waitForGraphQLOperation } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

for (const scenario of [
  {
    kind: 'followers',
    label: '팔로워',
    nextOperation: 'ProfileFollowersNextPageQuery',
    prefix: 'e2e-follower',
  },
  {
    kind: 'following',
    label: '팔로잉',
    nextOperation: 'ProfileFollowingNextPageQuery',
    prefix: 'e2e-following',
  },
] as const) {
  test(`${scenario.label} Relay connection은 다음 페이지를 기존 목록에 누적한다`, async ({
    context,
    page,
  }) => {
    const viewer = await createE2ESession({ handle: `e2e-${scenario.kind}-viewer` });
    const target = await createE2EProfile({ handle: `e2e-${scenario.kind}-target` });

    for (let index = 0; index < 21; index += 1) {
      const profile = await createE2EProfile({
        displayName: `${scenario.label} ${index.toString().padStart(2, '0')}`,
        handle: `${scenario.prefix}-${index.toString().padStart(2, '0')}`,
      });
      await createE2EFollow(
        scenario.kind === 'followers'
          ? { followeeProfileId: target.id, followerProfileId: profile.id }
          : { followeeProfileId: profile.id, followerProfileId: target.id },
      );
    }

    await setE2ESessionCookie(context, viewer.token);
    await page.goto(`/@${target.handle}/${scenario.kind}`);

    const connectionLinks = page.getByRole('link', { name: new RegExp(`@${scenario.prefix}-`) });
    await expect(page.getByText(scenario.label, { exact: true }).last()).toBeVisible();
    await expect(connectionLinks).toHaveCount(20);

    const nextPageResponse = waitForGraphQLOperation(page, scenario.nextOperation);
    await page.getByRole('button', { name: '더 불러오기' }).click();
    const response = await nextPageResponse;
    const operation = readGraphQLOperation(response.request().postData());

    expect(operation?.operationName).toBe(scenario.nextOperation);
    expect(operation?.variables).toMatchObject({ count: 20 });
    expect(operation?.variables?.cursor).toEqual(expect.any(String));
    await expect(connectionLinks).toHaveCount(21);
    await expect(page.getByRole('button', { name: '더 불러오기' })).toHaveCount(0);
  });
}
