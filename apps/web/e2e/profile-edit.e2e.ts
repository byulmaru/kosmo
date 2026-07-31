import {
  createE2EReadyProfileMedia,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation, readGraphQLOperation, toGlobalId } from './graphql';
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
