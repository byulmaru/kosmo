import {
  createE2EReadyProfileMedia,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import {
  isGraphQLOperation,
  readGraphQLOperation,
  toGlobalId,
  waitForGraphQLOperation,
} from './graphql';
import type { Page } from '@playwright/test';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('text-only 저장은 Ready avatar/header payload를 끝내고 Profile로 replace한다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ handle: 'prod613-text' });
  expect(session.profile).not.toBeNull();
  await createE2EReadyProfileMedia(session.profile!.id, session.account.id);
  await setE2ESessionCookie(context, session.token);

  await page.goto('/profile-edit');
  await page.getByRole('textbox', { name: '소개' }).fill('PROD-613 text-only boundary');
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/graphql' &&
      isGraphQLOperation(response.request().postData(), 'ProfileEditRouteUpdateProfileMutation'),
  );
  const profileRoutePromise = waitForProfileRoute(page);

  await page.getByRole('button', { name: '저장', exact: true }).click();
  const response = await responsePromise;
  const body = (await response.json()) as {
    data?: {
      updateProfile?: {
        profile?: {
          avatar?: { id?: string | null } | null;
          bio?: string | null;
          header?: { id?: string | null } | null;
          relativeHandle?: string | null;
        } | null;
      } | null;
    } | null;
    errors?: unknown[];
  };

  expect(body.errors, JSON.stringify(body, null, 2)).toBeUndefined();
  expect(body.data?.updateProfile?.profile).toMatchObject({
    avatar: { id: expect.any(String) },
    bio: 'PROD-613 text-only boundary',
    header: { id: expect.any(String) },
    relativeHandle: '@prod613-text',
  });
  await expect(page).toHaveURL(/\/@prod613-text$/);
  await profileRoutePromise;
  await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
});

test('Ready avatar/header ID 저장도 응답 결과와 최종 Profile route를 확인한다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ handle: 'prod613-ready-media' });
  expect(session.profile).not.toBeNull();
  const media = await createE2EReadyProfileMedia(session.profile!.id, session.account.id);
  const avatarId = toGlobalId('Media', media.avatar.id);
  const headerId = toGlobalId('Media', media.header.id);
  const issuedIds = [headerId, avatarId];
  let issueIndex = 0;
  let updateVariables: Record<string, unknown> | null = null;
  await setE2ESessionCookie(context, session.token);

  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName === 'ProfileEditRouteIssueMediaUploadUrlMutation') {
      const mediaId = issuedIds[issueIndex++];
      await route.fulfill({
        body: JSON.stringify({
          data: {
            issueMediaUploadUrl: {
              media: { id: mediaId },
              uploadUrl: `https://upload.example/${issueIndex}`,
            },
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (operation?.operationName === 'ProfileEditRouteCompleteMediaUploadMutation') {
      const variables = operation.variables as { input?: { id?: string } } | null | undefined;
      await route.fulfill({
        body: JSON.stringify({
          data: {
            completeMediaUpload: {
              media: { id: variables?.input?.id, state: 'READY' },
            },
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
      return;
    }
    if (operation?.operationName === 'ProfileEditRouteUpdateProfileMutation') {
      updateVariables = operation.variables ?? null;
    }
    await route.fallback();
  });
  await page.route('https://upload.example/**', async (route) => {
    await route.fulfill({ body: '', status: 204 });
  });

  await page.goto('/profile-edit');
  await selectReplacement(page, '헤더 이미지 변경', 'header.webp');
  await expect(page.getByText('새 헤더 이미지가 선택됐어요.')).toBeVisible();
  await selectReplacement(page, '아바타 이미지 편집', 'avatar.webp');
  await expect(page.getByText('새 아바타 이미지가 선택됐어요.')).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/graphql' &&
      isGraphQLOperation(response.request().postData(), 'ProfileEditRouteUpdateProfileMutation'),
  );
  const profileRoutePromise = waitForProfileRoute(page);
  await page.getByRole('textbox', { name: '소개' }).fill('PROD-613 Ready Media boundary');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const responseBody = (await (await responsePromise).json()) as {
    data?: { updateProfile?: { profile?: { relativeHandle?: string | null } | null } | null };
    errors?: unknown[];
  };

  expect(responseBody.errors, JSON.stringify(responseBody, null, 2)).toBeUndefined();
  expect(updateVariables).toMatchObject({ input: { avatarId, headerId } });
  expect(responseBody.data?.updateProfile?.profile?.relativeHandle).toBe('@prod613-ready-media');
  await expect(page).toHaveURL(/\/@prod613-ready-media$/);
  await profileRoutePromise;
});

test('프로필 태그는 같은 저장으로 서버에 반영되고 공개 프로필의 관계 목록 link로 표시된다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ handle: 'prod527-tags' });
  expect(session.profile).not.toBeNull();
  await setE2ESessionCookie(context, session.token);

  let updateVariables: Record<string, unknown> | null = null;
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName === 'ProfileEditRouteUpdateProfileMutation') {
      updateVariables = operation.variables ?? null;
    }
    await route.fallback();
  });

  await page.goto('/profile-edit');
  await page.getByRole('textbox', { name: '소개' }).fill('PROD-527 공개 표시 순서');
  await addProfileTag(page, 'FirstWrite');
  await addProfileTag(page, '길게표시되는프로필태그');

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/graphql' &&
      isGraphQLOperation(response.request().postData(), 'ProfileEditRouteUpdateProfileMutation'),
  );
  const profileRoutePromise = waitForProfileRoute(page);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const body = (await (await responsePromise).json()) as {
    data?: {
      updateProfile?: {
        profile?: {
          relativeHandle?: string | null;
          tags?: ReadonlyArray<{ id?: string | null; name?: string | null }>;
        } | null;
      } | null;
    } | null;
    errors?: unknown[];
  };

  expect(body.errors, JSON.stringify(body, null, 2)).toBeUndefined();
  expect(updateVariables).toMatchObject({
    input: { tags: ['FirstWrite', '길게표시되는프로필태그'] },
  });
  const updatedProfile = body.data?.updateProfile?.profile;
  expect(updatedProfile?.relativeHandle).toBe('@prod527-tags');
  expect(updatedProfile?.tags).toHaveLength(2);
  expect(updatedProfile?.tags).toEqual(
    expect.arrayContaining([
      { id: expect.any(String), name: 'FirstWrite' },
      { id: expect.any(String), name: '길게표시되는프로필태그' },
    ]),
  );
  await expect(page).toHaveURL(/\/@prod527-tags$/);
  await profileRoutePromise;

  // Relay cache만이 아니라 저장된 서버 상태를 다시 조회한다.
  const reloadedProfileRoutePromise = waitForProfileRoute(page);
  await page.reload();
  await reloadedProfileRoutePromise;
  await expect(page.getByText('#FirstWrite', { exact: true })).toBeVisible();
  await expect(page.getByText('#길게표시되는프로필태그', { exact: true })).toBeVisible();

  const tagList = page.getByTestId('profile-tag-list');
  await expect(tagList).toBeVisible();
  await expect(tagList).toHaveCSS('flex-wrap', 'wrap');
  await expect(tagList.getByText('#FirstWrite', { exact: true })).toBeVisible();
  await expect(tagList.getByText('#길게표시되는프로필태그', { exact: true })).toBeVisible();
  await expect(
    tagList.evaluate((node) => ({
      next: node.nextElementSibling?.textContent,
      previous: node.previousElementSibling?.textContent,
    })),
  ).resolves.toMatchObject({
    next: expect.stringContaining('팔로잉'),
    previous: 'PROD-527 공개 표시 순서',
  });
  const tagLink = page.getByRole('link', {
    exact: true,
    name: '#FirstWrite 관련 프로필 보기',
  });
  await expect(tagLink).toHaveAttribute('href', /\/hashtags\/[^/]+\/profiles$/);
  await expect(page.getByRole('button', { name: '#FirstWrite 제거' })).toHaveCount(0);
});

async function selectReplacement(page: Page, triggerName: string, fileName: string) {
  await page.getByRole('button', { name: triggerName, exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: '이미지 변경', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    buffer: Buffer.from('PROD-613 isolated E2E image'),
    mimeType: 'image/webp',
    name: fileName,
  });
}

async function waitForProfileRoute(page: Page) {
  const responses = await Promise.all([
    waitForGraphQLOperation(page, 'ProfileLayoutQuery'),
    waitForGraphQLOperation(page, 'ProfilePostListPageQuery'),
  ]);

  for (const response of responses) {
    const body = (await response.json()) as { errors?: unknown[] };
    expect(response.ok(), JSON.stringify(body, null, 2)).toBe(true);
    expect(body.errors, JSON.stringify(body, null, 2)).toBeUndefined();
  }
}

async function addProfileTag(page: Page, tag: string) {
  await page.getByRole('textbox', { name: '프로필 태그' }).fill(tag);
  await page.getByRole('button', { name: '태그 추가', exact: true }).click();
}
