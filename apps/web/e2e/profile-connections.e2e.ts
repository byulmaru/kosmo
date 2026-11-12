import { db, firstOrThrow, ProfileFollowRequests, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceState, ProfileFollowPolicy } from '@kosmo/core/enums';
import { and, eq } from 'drizzle-orm';
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

const gotoHome = async (page: Page) => {
  const homeResponse = waitForGraphQLOperation(page, 'HomePageQuery');
  await page.goto('/home');

  const response = await homeResponse;
  const body = (await response.json()) as { errors?: unknown[] };
  expect(response.ok(), JSON.stringify(body, null, 2)).toBe(true);
  expect(body.errors, JSON.stringify(body, null, 2)).toBeUndefined();
};

for (const scenario of [
  { kind: 'following', label: '팔로잉' },
  { kind: 'followers', label: '팔로워' },
] as const) {
  test(`프로필 헤더에서 연 ${scenario.label} 목록의 프로필 탐색은 대상 글을 표시하고 뒤로 가기로 목록을 복원한다`, async ({
    context,
    page,
  }) => {
    const owner = await createE2ESession({
      displayName: `E2E 관계 원본 ${scenario.kind}`,
      handle: `e2e-connection-origin-${scenario.kind}`,
    });
    const ownerProfile = owner.profile!;
    const target = await createE2EProfile({
      displayName: `E2E 관계 이동 대상 ${scenario.kind}`,
      handle: `e2e-connection-target-${scenario.kind}`,
    });
    const relationOnly = await createE2EProfile({
      displayName: `E2E 관계 원본 행 ${scenario.kind}`,
      handle: `e2e-connection-retained-${scenario.kind}`,
    });
    const targetPostBody = `E2E 이동 대상 게시글 ${scenario.kind}`;
    const ownerPostBody = `E2E 이동 원본 게시글 ${scenario.kind}`;
    await createE2EPost({ body: ownerPostBody, profileId: ownerProfile.id });
    await createE2EPost({ body: targetPostBody, profileId: target.id });
    for (const profile of [target, relationOnly]) {
      await createE2EFollow(
        scenario.kind === 'following'
          ? { followeeProfileId: profile.id, followerProfileId: ownerProfile.id }
          : { followeeProfileId: ownerProfile.id, followerProfileId: profile.id },
      );
    }
    await setE2ESessionCookie(context, owner.token);
    await page.setViewportSize({ height: 900, width: 1440 });

    const ownerPath = `/@${ownerProfile.handle}`;
    const connectionPath = `${ownerPath}/${scenario.kind}`;
    const targetPath = `/@${target.handle}`;
    const connectionHeading = page.getByRole('heading', {
      name: `${ownerProfile.displayName}님의 ${scenario.label}`,
      exact: true,
    });
    const targetHeading = page.getByRole('heading', { name: target.displayName, exact: true });
    const targetPost = page.getByRole('article').filter({ hasText: targetPostBody }).first();
    const ownerHeading = page.getByRole('heading', {
      name: ownerProfile.displayName,
      exact: true,
    });
    const ownerPost = page.getByRole('article').filter({ hasText: ownerPostBody }).first();
    const targetProfileLinks = page
      .locator(`a[href="${targetPath}"]`)
      .filter({ hasText: target.displayName, visible: true });
    const relationOnlyRow = page
      .locator(`a[href="/@${relationOnly.handle}"]`)
      .filter({ hasText: relationOnly.displayName, visible: true });

    await page.goto(ownerPath);
    await expect(
      page.getByRole('heading', { name: ownerProfile.displayName, exact: true }),
    ).toBeVisible();

    const connectionCountLink = page
      .getByTestId('universal-shell-content')
      .locator(`a[href="${connectionPath}"]`);
    await expect(connectionCountLink).toBeVisible();
    await connectionCountLink.click();
    await expect(page).toHaveURL(connectionPath);
    await expect(connectionHeading).toBeVisible();
    const targetRow = page
      .locator(`a[href="${targetPath}"]`)
      .filter({ hasText: target.displayName, visible: true });
    await expect(targetRow).toBeVisible();
    await targetRow.click();

    await expect(page).toHaveURL(targetPath);
    await expect(targetHeading).toBeVisible();
    await expect(targetPost).toBeVisible();
    await expect(
      targetPost.locator(`a[href="${targetPath}"]`).filter({ hasText: target.displayName }),
    ).toBeVisible();
    // The one matching link is the destination post owner; a stale relation row would add another.
    await expect(targetProfileLinks).toHaveCount(1);
    await expect(relationOnlyRow).toHaveCount(0);
    await expect(connectionHeading).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(connectionPath);
    await expect(connectionHeading).toBeVisible();
    await expect(targetRow).toBeVisible();
    await expect(relationOnlyRow).toBeVisible();
    await expect(targetHeading).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(targetPath);
    await expect(targetHeading).toBeVisible();
    await expect(targetPost).toBeVisible();
    await expect(targetProfileLinks).toHaveCount(1);
    await expect(relationOnlyRow).toHaveCount(0);
    await expect(connectionHeading).toHaveCount(0);

    await page.goto(targetPath);
    await expect(targetHeading).toBeVisible();
    await expect(targetPost).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(targetPath);
    await expect(targetHeading).toBeVisible();
    await expect(targetPost).toBeVisible();
    await expect(targetProfileLinks).toHaveCount(1);
    await expect(relationOnlyRow).toHaveCount(0);
    await expect(connectionHeading).toHaveCount(0);

    await page.goto(ownerPath);
    await expect(ownerHeading).toBeVisible();
    await expect(ownerPost).toBeVisible();
    await connectionCountLink.click();
    await expect(page).toHaveURL(connectionPath);
    await expect(connectionHeading).toBeVisible();
    await targetRow.click();
    await expect(page).toHaveURL(targetPath);
    await expect(targetHeading).toBeVisible();
    await expect(targetPost).toBeVisible();

    await page.getByRole('button', { name: '뒤로 가기' }).click();

    await expect(page).toHaveURL(ownerPath);
    await expect(ownerHeading).toBeVisible();
    await expect(ownerPost).toBeVisible();
    await expect(targetPost).toHaveCount(0);
  });
}

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

  const unfollowResponse = waitForGraphQLOperation(page, 'FollowButtonUnfollowProfileMutation');
  await page.getByRole('button', { name: '팔로잉' }).click();

  await expect(page.getByRole('button', { name: '팔로우' })).toBeVisible();
  await expect(followersLink.getByText('0', { exact: true })).toBeVisible();
  await unfollowResponse;
  await expect(page.getByRole('button', { name: '팔로우' })).toBeVisible();
  await expect(followersLink.getByText('0', { exact: true })).toBeVisible();
});

test('열린 팔로잉 목록은 unfollow 성공 후 기존 행을 유지한다', async ({ context, page }) => {
  const domain = 'e2e-retained-row.remote.example';
  const viewer = await createE2ESession({ handle: 'e2e-retained-row-viewer' });
  const remote = await createE2ERemoteProfile({
    displayName: '행 유지 대상',
    domain,
    handle: 'e2e-retained-row-target',
    instanceState: InstanceState.UNRESPONSIVE,
  });
  await createE2EFollow({
    followeeProfileId: remote.id,
    followerProfileId: viewer.profile!.id,
  });

  await setE2ESessionCookie(context, viewer.token);
  await page.goto(`/@${viewer.profile!.handle}/following`);

  await expect(page.getByText('행 유지 대상', { exact: true })).toBeVisible();
  const unfollowResponse = waitForGraphQLOperation(page, 'FollowButtonUnfollowProfileMutation');
  await page.getByRole('button', { name: '팔로잉' }).click();

  await expect(page.getByRole('button', { name: '팔로우' })).toBeVisible();
  await unfollowResponse;
  await expect(page.getByText('행 유지 대상', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '팔로우' })).toBeEnabled();
  expect(
    await db
      .select()
      .from(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, viewer.profile!.id),
          eq(ProfileFollows.followeeProfileId, remote.id),
        ),
      ),
  ).toHaveLength(0);
});

test('APPROVAL_REQUIRED remote follow request와 cancel은 count를 변경하지 않는다', async ({
  context,
  page,
}) => {
  const domain = 'e2e-pending.remote.example';
  const viewer = await createE2ESession({ handle: 'e2e-pending-viewer' });
  const remote = await createE2ERemoteProfile({
    domain,
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    handle: 'e2e-pending-target',
    instanceState: InstanceState.UNRESPONSIVE,
  });
  const relativeHandle = `@${remote.handle}@${domain}`;

  await setE2ESessionCookie(context, viewer.token);
  await page.goto(`/${relativeHandle}`);

  const viewerFollowing = page.locator(`a[href="/@${viewer.profile!.handle}/following"]`);
  const targetFollowers = page.locator(`a[href="/${relativeHandle}/followers"]`);
  await expect(viewerFollowing.getByText('0', { exact: true })).toBeVisible();
  await expect(targetFollowers.getByText('0', { exact: true })).toBeVisible();

  const followResponse = waitForGraphQLOperation(page, 'FollowButtonFollowProfileMutation');
  await page.getByRole('button', { name: '팔로우' }).click();

  await expect(page.getByRole('button', { name: '요청됨' })).toBeVisible();
  await followResponse;
  await expect(viewerFollowing.getByText('0', { exact: true })).toBeVisible();
  await expect(targetFollowers.getByText('0', { exact: true })).toBeVisible();
  expect(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, viewer.profile!.id),
          eq(ProfileFollowRequests.followeeProfileId, remote.id),
        ),
      ),
  ).toHaveLength(1);

  const cancelResponse = waitForGraphQLOperation(
    page,
    'FollowButtonCancelProfileFollowRequestMutation',
  );
  await page.getByRole('button', { name: '요청됨' }).click();

  await expect(page.getByRole('button', { name: '팔로우' })).toBeVisible();
  await cancelResponse;
  await expect(viewerFollowing.getByText('0', { exact: true })).toBeVisible();
  await expect(targetFollowers.getByText('0', { exact: true })).toBeVisible();
  expect(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(
        and(
          eq(ProfileFollowRequests.followerProfileId, viewer.profile!.id),
          eq(ProfileFollowRequests.followeeProfileId, remote.id),
        ),
      ),
  ).toHaveLength(0);
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

test('Web GraphQL payload와 DB 상태가 일치한다', async ({ context, page }) => {
  const viewer = await createE2ESession({ handle: 'e2e-delivery-viewer' });
  const openRemote = await createE2ERemoteProfile({ handle: 'e2e-delivery-open' });
  const approvalRemote = await createE2ERemoteProfile({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    handle: 'e2e-delivery-approval',
  });
  await setE2ESessionCookie(context, viewer.token);
  await gotoHome(page);

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

test('follow와 동시 unfollow는 저장 count를 한 번만 갱신한다', async ({ context, page }) => {
  const viewer = await createE2ESession({ handle: 'e2e-count-viewer' });
  const target = await createE2EProfile({ handle: 'e2e-count-target' });
  const targetId = toGlobalId('Profile', target.id);
  const viewerId = toGlobalId('Profile', viewer.profile!.id);

  await setE2ESessionCookie(context, viewer.token);
  await gotoHome(page);

  const followResponse = await mutateFollow(page, 'followProfile', targetId);
  expect(followResponse.errors).toBeUndefined();
  expect(followResponse.data.followProfile.followerProfile).toMatchObject({
    followingCount: 1,
    id: viewerId,
  });
  expect(followResponse.data.followProfile.followeeProfile).toMatchObject({
    followersCount: 1,
    id: targetId,
  });

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
  await gotoHome(page);
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
    const nextPageResponse = waitForGraphQLOperation(page, scenario.nextOperation);
    await page.goto(`/@${target.handle}/${scenario.kind}`);

    const connectionLinks = page.getByRole('link', { name: new RegExp(`@${scenario.prefix}-`) });
    await expect(page.getByText(scenario.label, { exact: true }).last()).toBeVisible();
    const response = await nextPageResponse;
    const operation = readGraphQLOperation(response.request().postData());

    expect(operation?.operationName).toBe(scenario.nextOperation);
    expect(operation?.variables).toMatchObject({ count: 20 });
    expect(operation?.variables?.cursor).toEqual(expect.any(String));
    await expect(connectionLinks).toHaveCount(21);
    await expect(page.getByRole('button', { name: '더 불러오기' })).toHaveCount(0);
  });
}
