import {
  AccountProfiles,
  db,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileHashtags,
} from '@kosmo/core/db';
import { PostVisibility, ProfileFollowPolicy } from '@kosmo/core/enums';
import { and, eq } from 'drizzle-orm';
import {
  createE2EHashtagRelation,
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation, toGlobalId } from './graphql';
import type { Page } from '@playwright/test';

test.beforeEach(resetE2EDatabase);

async function reachTags(page: Page, handle: string) {
  await page.goto('/first-profile/handle');
  await page.getByRole('textbox', { name: '핸들', exact: true }).fill(handle);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/details$/);
  await page.getByRole('button', { name: '지금은 건너뛰기' }).click();
  await expect(page).toHaveURL(/\/first-profile\/tags$/);
}
async function addTag(page: Page, name: string) {
  await page.getByRole('textbox', { name: '프로필 태그', exact: true }).fill(name);
  await page.getByRole('button', { name: '추가', exact: true }).click();
}
async function openDiscovery(page: Page) {
  await page.getByRole('button', { name: '바로 시작' }).click();
}
const profileRow = (page: Page, handle: string) =>
  page.locator(`a[href="/@${handle}"]:visible`).locator('..');

async function createdProfileId(accountId: string) {
  const rows = await db
    .select({ id: AccountProfiles.profileId })
    .from(AccountProfiles)
    .where(eq(AccountProfiles.accountId, accountId));
  expect(rows).toHaveLength(1);
  return rows[0]!.id;
}

test('태그 조회와 팔로우를 순차 처리하고 두 태그의 관계 상태와 홈을 이어 본다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ profile: false });
  const open = await createE2EProfile({ handle: 'discovery_open', displayName: '책 읽는 사람' });
  const approval = await createE2EProfile({
    handle: 'discovery_approval',
    displayName: '음악 듣는 사람',
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
  });
  const books = await createE2EHashtagRelation({
    displayName: '책',
    name: '책',
    profileIds: [open.id, approval.id],
  });
  const music = await createE2EHashtagRelation({
    displayName: '음악',
    name: '음악',
    profileIds: [open.id, approval.id],
  });
  await createE2EPost({
    profileId: open.id,
    body: '팔로우한 사람의 이어 읽을 글',
    visibility: PostVisibility.FOLLOWERS,
  });
  await createE2EPost({
    profileId: approval.id,
    body: '승인 전에는 볼 수 없는 글',
    visibility: PostVisibility.FOLLOWERS,
  });
  await setE2ESessionCookie(context, session.token);
  await page.setViewportSize({ width: 390, height: 844 });
  const tagQueries: string[] = [];
  const followMutations: string[] = [];
  page.on('request', (request) => {
    const operation = readGraphQLOperation(request.postData());
    if (operation?.operationName === 'FirstProfileTagDiscoveryTagQuery') {
      tagQueries.push(String(operation.variables?.hashtagId));
    }
    if (
      operation?.operationName?.startsWith('FollowButton') &&
      operation.operationName.endsWith('Mutation')
    ) {
      followMutations.push(operation.operationName);
    }
  });
  await reachTags(page, 'discovery_first');
  await addTag(page, '책');
  await addTag(page, '음악');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/posting$/);
  const viewerId = await createdProfileId(session.account.id);
  const savedTags = await db
    .select({ id: ProfileHashtags.hashtagId })
    .from(ProfileHashtags)
    .where(eq(ProfileHashtags.profileId, viewerId));
  expect(new Set(savedTags.map(({ id }) => id))).toEqual(new Set([books.id, music.id]));
  let releaseTagQuery!: () => void;
  let notifyTagQueryFetched!: () => void;
  const tagQueryRelease = new Promise<void>((resolve) => {
    releaseTagQuery = resolve;
  });
  const tagQueryFetched = new Promise<void>((resolve) => {
    notifyTagQueryFetched = resolve;
  });
  let releaseFollowMutation!: () => void;
  let notifyFollowMutationFetched!: () => void;
  const followMutationRelease = new Promise<void>((resolve) => {
    releaseFollowMutation = resolve;
  });
  const followMutationFetched = new Promise<void>((resolve) => {
    notifyFollowMutationFetched = resolve;
  });
  let holdFirstTagQuery = true;
  let holdFirstFollowMutation = true;
  await page.route('**/graphql', async (route) => {
    const name = readGraphQLOperation(route.request().postData())?.operationName;
    if (holdFirstTagQuery && name === 'FirstProfileTagDiscoveryTagQuery') {
      holdFirstTagQuery = false;
      const response = await route.fetch();
      notifyTagQueryFetched();
      await tagQueryRelease;
      await route.fulfill({ response });
      return;
    }
    if (holdFirstFollowMutation && name === 'FollowButtonFollowProfileMutation') {
      holdFirstFollowMutation = false;
      const response = await route.fetch();
      notifyFollowMutationFetched();
      await followMutationRelease;
      await route.fulfill({ response });
      return;
    }
    await route.fallback();
  });

  try {
    await openDiscovery(page);
    await expect(page).toHaveURL(/\/first-profile\/discover$/);
    await tagQueryFetched;
    await expect(page.getByRole('button', { name: '#책', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '이전 화면', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '#음악', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '계속하기', exact: true })).toBeEnabled();
    expect(tagQueries).toHaveLength(1);
    expect(followMutations).toEqual([]);
    releaseTagQuery();
    await expect(
      profileRow(page, open.handle).getByRole('button', { name: '팔로우', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '#책', exact: true }).click();
    await expect(
      profileRow(page, open.handle).getByRole('button', { name: '팔로우', exact: true }),
    ).toBeEnabled();
    expect(followMutations).toEqual([]);
    const tagQueriesBeforeFollow = tagQueries.length;
    await profileRow(page, open.handle)
      .getByRole('button', { name: '팔로우', exact: true })
      .click();
    await followMutationFetched;
    await expect(page.getByRole('button', { name: '#책', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '이전 화면', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '#음악', exact: true })).toBeDisabled();
    await expect(
      profileRow(page, open.handle).getByRole('button', { name: '팔로잉', exact: true }),
    ).toBeDisabled();
    await expect(
      profileRow(page, approval.handle).getByRole('button', { name: '팔로우', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: '계속하기', exact: true })).toBeEnabled();
    expect(tagQueries).toHaveLength(tagQueriesBeforeFollow);
    expect(followMutations).toEqual(['FollowButtonFollowProfileMutation']);
    expect(
      await db
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, viewerId),
            eq(ProfileFollows.followeeProfileId, open.id),
          ),
        ),
    ).toHaveLength(1);
    releaseFollowMutation();
    await expect(
      profileRow(page, open.handle).getByRole('button', { name: '팔로잉', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '#음악', exact: true }).click();
    await expect(
      profileRow(page, open.handle).getByRole('button', { name: '팔로잉', exact: true }),
    ).toBeEnabled();
    await profileRow(page, approval.handle)
      .getByRole('button', { name: '팔로우', exact: true })
      .click();
    await expect(
      profileRow(page, approval.handle).getByRole('button', { name: '요청됨', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: '#책', exact: true }).click();
    await expect(
      profileRow(page, approval.handle).getByRole('button', { name: '요청됨', exact: true }),
    ).toBeEnabled();
    expect(new Set(tagQueries)).toEqual(
      new Set([toGlobalId('Hashtag', books.id), toGlobalId('Hashtag', music.id)]),
    );
    expect(followMutations).toEqual([
      'FollowButtonFollowProfileMutation',
      'FollowButtonFollowProfileMutation',
    ]);
    expect(
      await db
        .select()
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, viewerId),
            eq(ProfileFollows.followeeProfileId, approval.id),
          ),
        ),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, viewerId),
            eq(ProfileFollowRequests.followeeProfileId, approval.id),
          ),
        ),
    ).toHaveLength(1);
    await expect(
      page.getByText('팔로우하지 않아도 지금은 넘어갈 수 있어요', { exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '계속하기', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText('팔로우한 사람의 이어 읽을 글', { exact: true })).toBeVisible();
    await expect(page.getByText('승인 전에는 볼 수 없는 글', { exact: true })).toHaveCount(0);
    expect(followMutations).toHaveLength(2);
  } finally {
    releaseTagQuery();
    releaseFollowMutation();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('태그 저장 실패 초안은 사용하지 않고 이전 저장값으로 진행하며 조회 실패는 재시도한다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ profile: false });
  const target = await createE2EProfile({
    handle: 'saved_tag_person',
    displayName: '저장 태그의 사람',
  });
  await createE2EHashtagRelation({ displayName: '책', name: '책', profileIds: [target.id] });
  await setE2ESessionCookie(context, session.token);
  await reachTags(page, 'discovery_retry');
  await addTag(page, '책');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/posting$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/first-profile\/tags$/);
  await addTag(page, '게임');
  let failTagQuery = true;
  await page.route('**/graphql', async (route) => {
    const name = readGraphQLOperation(route.request().postData())?.operationName;
    if (
      name === 'FirstProfileOnboardingSaveMutation' ||
      (failTagQuery && name === 'FirstProfileTagDiscoveryQuery')
    ) {
      if (name === 'FirstProfileTagDiscoveryQuery') {
        failTagQuery = false;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: null, errors: [{ message: 'unavailable' }] }),
      });
    } else {
      await route.fallback();
    }
  });
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('button', { name: '바로 시작' })).toBeEnabled();
  await openDiscovery(page);
  await expect(page).toHaveURL(/\/first-profile\/discover$/);
  await expect(page.getByRole('button', { name: '계속하기', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.getByRole('button', { name: '#책', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '#게임', exact: true })).toHaveCount(0);
  await expect(
    profileRow(page, target.handle).getByRole('button', { name: '팔로우', exact: true }),
  ).toBeEnabled();
  const viewerId = await createdProfileId(session.account.id);
  await page.getByRole('button', { name: '계속하기', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(
    await db.select().from(ProfileFollows).where(eq(ProfileFollows.followerProfileId, viewerId)),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.followerProfileId, viewerId)),
  ).toHaveLength(0);
});

test('미저장 태그만 있으면 사람 찾기를 생략하고 재진입해도 온보딩을 다시 시작하지 않는다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, session.token);
  await reachTags(page, 'discovery_skip');
  await addTag(page, '미저장');
  await openDiscovery(page);
  await expect(page).toHaveURL(/\/home$/);
  const viewerId = await createdProfileId(session.account.id);
  expect(
    await db.select().from(ProfileHashtags).where(eq(ProfileHashtags.profileId, viewerId)),
  ).toHaveLength(0);
  await page.goto('/first-profile/discover');
  await expect(page).toHaveURL(/\/home$/);
  expect(await createdProfileId(session.account.id)).toBe(viewerId);
});
