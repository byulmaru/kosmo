import { db, firstOrThrow, ProfileFollowRequests, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceState, ProfileFollowPolicy } from '@kosmo/core/enums';
import { eq } from 'drizzle-orm';
import {
  createE2EFollow,
  createE2EProfile,
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

const mutateGraphQL = async (page: Page, query: string, variables: Record<string, string>) =>
  page.evaluate(
    async ({ query, variables }) => {
      const response = await fetch('/graphql', {
        body: JSON.stringify({ query, variables }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      return response.json();
    },
    { query, variables },
  );

const mutateFollow = async (
  page: Page,
  operation: 'followProfile' | 'unfollowProfile',
  profileId: string,
) =>
  mutateGraphQL(
    page,
    `mutation E2EProfileFollow($id: ID!) {
      ${operation}(input: { id: $id }) {
        ${operation === 'unfollowProfile' ? 'profileFollowId' : ''}
        followerProfile { id followingCount }
        followeeProfile { id followersCount }
      }
    }`,
    { id: profileId },
  );

test('UNRESPONSIVE remote profile은 Web에서 follow와 unfollow할 수 있다', async ({
  context,
  page,
}) => {
  const domain = 'e2e-unresponsive.remote.example';
  const viewer = await createE2ESession({ handle: 'e2e-remote-viewer' });
  const remote = await createE2ERemoteProfile({
    domain,
    handle: 'e2e-unresponsive',
    instanceState: InstanceState.UNRESPONSIVE,
  });
  const relativeHandle = `@${remote.handle}@${domain}`;

  await setE2ESessionCookie(context, viewer.token);
  await page.goto(`/${relativeHandle}`);

  const followersLink = page.locator(`a[href="/${relativeHandle}/followers"]`);
  await expect(page.getByRole('button', { name: '팔로우' })).toBeVisible();
  await expect(followersLink.getByText('0', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '팔로우' }).click();

  await expect(page.getByRole('button', { name: '팔로잉' })).toBeVisible();
  await expect(followersLink.getByText('1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '팔로잉' }).click();

  await expect(page.getByRole('button', { name: '팔로우' })).toBeVisible();
  await expect(followersLink.getByText('0', { exact: true })).toBeVisible();
});

test('SUSPENDED remote profile은 Web action surface에 노출되지 않는다', async ({
  context,
  page,
}) => {
  const domain = 'e2e-suspended.remote.example';
  const viewer = await createE2ESession({ handle: 'e2e-suspended-viewer' });
  const remote = await createE2ERemoteProfile({
    domain,
    handle: 'e2e-suspended',
    instanceState: InstanceState.SUSPENDED,
  });

  await setE2ESessionCookie(context, viewer.token);
  await page.goto(`/@${remote.handle}@${domain}`);

  await expect(page.getByText('프로필을 찾을 수 없어요')).toBeVisible();
  await expect(page.getByRole('button', { name: /팔로우/ })).toHaveCount(0);
});

test('post-commit delivery 실패에도 Web GraphQL payload와 DB 상태가 일치한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ handle: 'e2e-delivery-viewer' });
  const openRemote = await createE2ERemoteProfile({ handle: 'e2e-delivery-open' });
  const approvalRemote = await createE2ERemoteProfile({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    handle: 'e2e-delivery-approval',
  });
  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/home');

  const follow = await mutateFollow(page, 'followProfile', toGlobalId('Profile', openRemote.id));
  expect(follow.errors).toBeUndefined();
  expect(follow.data.followProfile).toMatchObject({
    followeeProfile: { followersCount: 1 },
    followerProfile: { followingCount: 1 },
  });
  expect(await db.select().from(ProfileFollows)).toHaveLength(1);

  const unfollow = await mutateFollow(
    page,
    'unfollowProfile',
    toGlobalId('Profile', openRemote.id),
  );
  expect(unfollow.errors).toBeUndefined();
  expect(unfollow.data.unfollowProfile).toMatchObject({
    followeeProfile: { followersCount: 0 },
    followerProfile: { followingCount: 0 },
  });
  expect(unfollow.data.unfollowProfile.profileFollowId).toBeTruthy();
  expect(await db.select().from(ProfileFollows)).toHaveLength(0);

  const requested = await mutateGraphQL(
    page,
    `mutation RequestRemoteFollow($id: ID!) {
      followProfile(input: { id: $id }) {
        followeeProfile { followersCount }
        followerProfile { followingCount }
        result { __typename ... on ProfileFollowRequest { id } }
      }
    }`,
    { id: toGlobalId('Profile', approvalRemote.id) },
  );
  expect(requested.errors).toBeUndefined();
  expect(requested.data.followProfile).toMatchObject({
    followeeProfile: { followersCount: 0 },
    followerProfile: { followingCount: 0 },
    result: { __typename: 'ProfileFollowRequest' },
  });
  expect(await db.select().from(ProfileFollowRequests)).toHaveLength(1);

  const requestId = requested.data.followProfile.result.id;
  const canceled = await mutateGraphQL(
    page,
    `mutation CancelRemoteFollow($id: ID!) {
      cancelProfileFollowRequest(input: { id: $id }) {
        followerProfile { followingCount id }
        profileFollowRequestId
      }
    }`,
    { id: requestId },
  );
  expect(canceled.errors).toBeUndefined();
  expect(canceled.data.cancelProfileFollowRequest).toMatchObject({
    followerProfile: {
      followingCount: 0,
      id: toGlobalId('Profile', viewer.profile!.id),
    },
    profileFollowRequestId: requestId,
  });
  expect(await db.select().from(ProfileFollowRequests)).toHaveLength(0);
});

test('동시 follow와 unfollow는 저장 count를 한 번만 갱신한다', async ({ context, page }) => {
  const viewer = await createE2ESession({ handle: 'e2e-count-viewer' });
  const target = await createE2EProfile({ handle: 'e2e-count-target' });
  const targetId = toGlobalId('Profile', target.id);
  const viewerId = toGlobalId('Profile', viewer.profile!.id);

  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/home');

  const followResponses = await Promise.all([
    mutateFollow(page, 'followProfile', targetId),
    mutateFollow(page, 'followProfile', targetId),
  ]);
  expect(followResponses.every((response) => !response.errors)).toBe(true);
  for (const response of followResponses) {
    expect(response.data.followProfile.followerProfile).toMatchObject({
      followingCount: 1,
      id: viewerId,
    });
    expect(response.data.followProfile.followeeProfile).toMatchObject({
      followersCount: 1,
      id: targetId,
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
    mutateFollow(page, 'unfollowProfile', targetId),
    mutateFollow(page, 'unfollowProfile', targetId),
  ]);
  expect(unfollowResponses.every((response) => !response.errors)).toBe(true);
  for (const response of unfollowResponses) {
    expect(response.data.unfollowProfile.followerProfile).toMatchObject({
      followingCount: 0,
      id: viewerId,
    });
    expect(response.data.unfollowProfile.followeeProfile).toMatchObject({
      followersCount: 0,
      id: targetId,
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
  const response = await mutateFollow(page, 'unfollowProfile', toGlobalId('Profile', target.id));
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
