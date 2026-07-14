import { db, firstOrThrow, ProfileFollows, Profiles } from '@kosmo/core/db';
import { eq } from 'drizzle-orm';
import {
  createE2EFollow,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, waitForGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

const mutateFollow = async (
  page: Page,
  operation: 'followProfile' | 'unfollowProfile',
  profileId: string,
) =>
  page.evaluate(
    async ({ operation, profileId }) => {
      const response = await fetch('/graphql', {
        body: JSON.stringify({
          query: `
            mutation E2EProfileFollow($id: ID!) {
              ${operation}(input: { id: $id }) {
                ${operation === 'followProfile' ? 'profileFollow { id }' : 'profileFollowId'}
                followerProfile { id followingCount }
                followeeProfile { id followersCount }
              }
            }
          `,
          operationName: 'E2EProfileFollow',
          variables: { id: profileId },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      return response.json();
    },
    { operation, profileId },
  );

test('동시 follow와 unfollow는 저장 count를 한 번만 갱신한다', async ({ context, page }) => {
  const viewer = await createE2ESession({ handle: 'e2e-count-viewer' });
  const target = await createE2EProfile({ handle: 'e2e-count-target' });

  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/home');

  const followResponses = await Promise.all([
    mutateFollow(page, 'followProfile', target.id),
    mutateFollow(page, 'followProfile', target.id),
  ]);
  expect(followResponses.every((response) => !response.errors)).toBe(true);
  for (const response of followResponses) {
    expect(response.data.followProfile.followerProfile).toMatchObject({
      followingCount: 1,
      id: viewer.profile!.id,
    });
    expect(response.data.followProfile.followeeProfile).toMatchObject({
      followersCount: 1,
      id: target.id,
    });
  }

  const followedViewer = await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, viewer.profile!.id))
    .then(firstOrThrow);
  const followedTarget = await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, target.id))
    .then(firstOrThrow);
  expect(followedViewer.followingCount).toBe(1);
  expect(followedTarget.followersCount).toBe(1);

  const unfollowResponses = await Promise.all([
    mutateFollow(page, 'unfollowProfile', target.id),
    mutateFollow(page, 'unfollowProfile', target.id),
  ]);
  expect(unfollowResponses.every((response) => !response.errors)).toBe(true);
  for (const response of unfollowResponses) {
    expect(response.data.unfollowProfile.followerProfile).toMatchObject({
      followingCount: 0,
      id: viewer.profile!.id,
    });
    expect(response.data.unfollowProfile.followeeProfile).toMatchObject({
      followersCount: 0,
      id: target.id,
    });
  }

  const unfollowedViewer = await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, viewer.profile!.id))
    .then(firstOrThrow);
  const unfollowedTarget = await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, target.id))
    .then(firstOrThrow);
  expect(unfollowedViewer.followingCount).toBe(0);
  expect(unfollowedTarget.followersCount).toBe(0);
});

test('unfollow 저장 count는 0 미만으로 감소하지 않는다', async ({ context, page }) => {
  const viewer = await createE2ESession({ handle: 'e2e-count-floor-viewer' });
  const target = await createE2EProfile({ handle: 'e2e-count-floor-target' });
  await db.insert(ProfileFollows).values({
    followeeProfileId: target.id,
    followerProfileId: viewer.profile!.id,
  });

  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/home');
  const response = await mutateFollow(page, 'unfollowProfile', target.id);
  expect(response.errors).toBeUndefined();

  const profiles = await db.select().from(Profiles).where(eq(Profiles.id, viewer.profile!.id));
  const updatedTarget = await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, target.id))
    .then(firstOrThrow);
  expect(profiles[0]?.followingCount).toBe(0);
  expect(updatedTarget.followersCount).toBe(0);
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
