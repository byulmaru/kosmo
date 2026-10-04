import { db, HashtagMuteRules } from '@kosmo/core/db';
import { HashtagMuteDecision, HashtagMuteScope } from '@kosmo/core/enums';
import { and, eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import {
  createE2EAccountProfile,
  createE2EHashtagRelation,
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

test('Profile Tag 알림 상태 조회 실패를 다시 시도한다', async ({ context, page }) => {
  const viewer = await createE2ESession({ handle: 'prod735-retry-viewer' });
  const target = await createE2EProfile({ handle: 'prod735-retry-target' });
  await createE2EHashtagRelation({
    displayName: 'PROD735Retry',
    name: 'prod735retry',
    profileIds: [target.id],
  });
  await setE2ESessionCookie(context, viewer.token);

  let failInitialStatusRead = true;
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName === 'ProfileLayoutQuery' && failInitialStatusRead) {
      failInitialStatusRead = false;
      const response = await route.fetch();
      const body = (await response.json()) as {
        data: { profileByHandle: { tags: Array<{ viewerMuteRule: unknown }> } };
        errors?: unknown[];
      };
      body.data.profileByHandle.tags[0]!.viewerMuteRule = null;
      body.errors = [
        {
          message: 'E2E forced viewer mute rule field error',
          path: ['profileByHandle', 'tags', 0, 'viewerMuteRule'],
        },
      ];
      await route.fulfill({ response, body: JSON.stringify(body) });
      return;
    }
    await route.fallback();
  });

  await page.goto(`/@${target.handle}`);
  await expect(
    page.getByRole('button', {
      exact: true,
      name: '#PROD735Retry 알림 상태를 불러오지 못했어요. 다시 시도',
    }),
  ).toBeVisible();

  const retryResponse = waitForGraphQLOperation(page, 'ProfileTagMuteActionRefetchQuery');
  await page
    .getByRole('button', {
      exact: true,
      name: '#PROD735Retry 알림 상태를 불러오지 못했어요. 다시 시도',
    })
    .click();
  await assertGraphQLSuccess(await retryResponse);
  await expect(
    page.getByRole('button', { exact: true, name: '#PROD735Retry 새 알림 뮤트 설정' }),
  ).toBeVisible();
});

test('Profile Tag에서 Notification 전용 영구 규칙을 만들고 해제하며 기존 링크를 유지한다', async ({
  context,
  page,
}) => {
  const browserErrors: string[] = [];
  const graphQLErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('response', (response) => {
    const operation = readGraphQLOperation(response.request().postData());
    if (!operation) {
      return;
    }

    void response
      .json()
      .then((body: { errors?: ReadonlyArray<{ message: string }> }) => {
        if (body.errors?.length) {
          graphQLErrors.push(`${operation.operationName}: ${JSON.stringify(body.errors)}`);
        }
      })
      .catch(() => {});
  });

  const viewer = await createE2ESession({ handle: 'prod735-viewer' });
  const target = await createE2EProfile({
    displayName: 'PROD-735 대상 프로필',
    handle: 'prod735-target',
  });
  const hashtag = await createE2EHashtagRelation({
    displayName: 'PROD735Tag',
    name: 'prod735tag',
    profileIds: [target.id],
  });
  await setE2ESessionCookie(context, viewer.token);

  let createMutationCount = 0;
  let releaseCreate!: () => void;
  let notifyCreateResponseFetched!: () => void;
  const createRelease = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  const createResponseFetched = new Promise<void>((resolve) => {
    notifyCreateResponseFetched = resolve;
  });
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName === 'ProfileTagMuteActionCreateMutation') {
      createMutationCount += 1;
      if (createMutationCount === 1) {
        await route.fulfill({
          body: JSON.stringify({
            data: null,
            errors: [{ message: 'E2E forced create failure', path: ['createHashtagMuteRule'] }],
          }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      const response = await route.fetch();
      notifyCreateResponseFetched();
      await createRelease;
      await route.fulfill({ response });
      return;
    }
    await route.fallback();
  });
  await page.goto(`/@${target.handle}`);

  const tagLink = page.getByRole('link', { exact: true, name: '#PROD735Tag 관련 프로필 보기' });
  await expect(tagLink).toHaveAttribute('href', /\/hashtags\/[^/]+\/profiles$/u);

  const muteButton = () =>
    page.getByRole('button', { exact: true, name: '#PROD735Tag 새 알림 뮤트 설정' });
  await expect(muteButton()).toBeVisible();
  await muteButton().click();
  await page.getByRole('menuitem', { exact: true, name: '새 알림 뮤트' }).click();
  await expect(
    page.getByRole('dialog', { name: '#PROD735Tag 새 알림을 뮤트할까요?' }),
  ).toBeVisible();

  await page.getByRole('button', { exact: true, name: '취소' }).click();
  await expect(muteButton()).toBeFocused();
  expect(createMutationCount).toBe(0);
  await muteButton().click();
  await page.getByRole('menuitem', { exact: true, name: '새 알림 뮤트' }).click();

  const failedCreateResponse = waitForGraphQLOperation(page, 'ProfileTagMuteActionCreateMutation');
  await page.getByRole('button', { exact: true, name: '알림 뮤트' }).click();
  await failedCreateResponse;
  await expect(page.getByRole('alert')).toContainText(
    '#PROD735Tag 새 알림 뮤트 상태를 변경하지 못했어요. 다시 확인해 주세요.',
  );
  await expect(muteButton()).toBeVisible();
  expect(
    await db
      .select()
      .from(HashtagMuteRules)
      .where(eq(HashtagMuteRules.ownerProfileId, viewer.profile!.id)),
  ).toHaveLength(0);

  await muteButton().click();
  await page.getByRole('menuitem', { exact: true, name: '새 알림 뮤트' }).click();
  const createResponse = waitForGraphQLOperation(page, 'ProfileTagMuteActionCreateMutation');
  await page.getByRole('button', { exact: true, name: '알림 뮤트' }).click();
  await createResponseFetched;
  expect(createMutationCount).toBe(2);
  await expect(page.getByRole('button', { exact: true, name: '알림 뮤트' })).toBeDisabled();
  releaseCreate();
  await assertGraphQLSuccess(await createResponse);
  await expect(
    page.getByRole('button', { exact: true, name: '#PROD735Tag 새 알림 뮤트됨. 설정 변경' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('#PROD735Tag 새 알림 뮤트를 설정했어요.');

  const createdRule = await db
    .select()
    .from(HashtagMuteRules)
    .where(
      and(
        eq(HashtagMuteRules.ownerProfileId, viewer.profile!.id),
        eq(HashtagMuteRules.targetHashtagId, hashtag.id),
      ),
    )
    .then((rows) => rows[0]);
  expect(createdRule).toMatchObject({
    decision: HashtagMuteDecision.EXCLUDE,
    expiresAt: null,
    ownerProfileId: viewer.profile!.id,
    scopes: [HashtagMuteScope.NOTIFICATION],
    targetHashtagId: hashtag.id,
  });

  const unmuteButton = () =>
    page.getByRole('button', { exact: true, name: '#PROD735Tag 새 알림 뮤트됨. 설정 변경' });
  await unmuteButton().click();
  await page.getByRole('menuitem', { exact: true, name: '새 알림 뮤트 해제' }).click();
  await expect(
    page.getByRole('dialog', { name: '#PROD735Tag 새 알림 뮤트를 해제할까요?' }),
  ).toBeVisible();
  const deleteResponse = waitForGraphQLOperation(page, 'ProfileTagMuteActionDeleteMutation');
  await page.getByRole('button', { exact: true, name: '뮤트 해제' }).click();
  await assertGraphQLSuccess(await deleteResponse);
  try {
    await expect(muteButton()).toBeVisible();
  } catch (error) {
    const diagnostics = [...browserErrors, ...graphQLErrors].join('\n');
    throw new Error([diagnostics, String(error)].filter(Boolean).join('\n'));
  }
  await expect(page.getByRole('alert')).toContainText('#PROD735Tag 새 알림 뮤트를 해제했어요.');
  expect(
    await db
      .select()
      .from(HashtagMuteRules)
      .where(
        and(
          eq(HashtagMuteRules.ownerProfileId, viewer.profile!.id),
          eq(HashtagMuteRules.targetHashtagId, hashtag.id),
        ),
      ),
  ).toHaveLength(0);

  await tagLink.click();
  await expect(page).toHaveURL(/\/hashtags\/[^/]+\/profiles$/u);
  await expect(page.getByRole('heading', { name: '#PROD735Tag 관련 프로필' })).toBeVisible();
});

for (const action of ['create', 'update'] as const) {
  test(`Profile Tag ${action} 성공 후 알림 상태 projection 오류에도 완료하고 상태 조회를 재시도한다`, async ({
    context,
    page,
  }) => {
    const viewer = await createE2ESession({ handle: `prod735-partial-${action}-viewer` });
    const target = await createE2EProfile({ handle: `prod735-partial-${action}-target` });
    const hashtag = await createE2EHashtagRelation({
      displayName: 'PROD735Partial',
      name: 'prod735partial',
      profileIds: [target.id],
    });
    const originalRule =
      action === 'update'
        ? await db
            .insert(HashtagMuteRules)
            .values({
              ownerProfileId: viewer.profile!.id,
              targetHashtagId: hashtag.id,
              scopes: [HashtagMuteScope.HOME],
              decision: HashtagMuteDecision.COLLAPSE,
              expiresAt: null,
            })
            .returning()
            .then((rows) => rows[0]!)
        : null;
    await setE2ESessionCookie(context, viewer.token);

    const operationName =
      action === 'create'
        ? 'ProfileTagMuteActionCreateMutation'
        : 'ProfileTagMuteActionUpdateMutation';
    const mutationField = action === 'create' ? 'createHashtagMuteRule' : 'updateHashtagMuteRule';
    await page.route('**/graphql', async (route) => {
      const operation = readGraphQLOperation(route.request().postData());
      if (operation?.operationName === operationName) {
        const response = await route.fetch();
        const body = (await response.json()) as {
          data: Record<
            string,
            { hashtagMuteRule: { id: string; targetHashtag: { viewerMuteRule: unknown } } }
          >;
          errors?: unknown[];
        };
        expect(response.ok()).toBe(true);
        expect(body.errors).toBeUndefined();
        expect(body.data[mutationField]!.hashtagMuteRule.id).toBeTruthy();
        body.data[mutationField]!.hashtagMuteRule.targetHashtag.viewerMuteRule = null;
        body.errors = [
          {
            message: 'E2E forced viewer mute rule projection failure',
            path: [mutationField, 'hashtagMuteRule', 'targetHashtag', 'viewerMuteRule'],
          },
        ];
        await route.fulfill({ response, body: JSON.stringify(body) });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/@${target.handle}`);
    await page
      .getByRole('button', { exact: true, name: '#PROD735Partial 새 알림 뮤트 설정' })
      .click();
    await page.getByRole('menuitem', { exact: true, name: '새 알림 뮤트' }).click();
    const dialog = page.getByRole('dialog', { name: '#PROD735Partial 새 알림을 뮤트할까요?' });
    await expect(dialog).toBeVisible();
    const mutationResponse = waitForGraphQLOperation(page, operationName);
    await page.getByRole('button', { exact: true, name: '알림 뮤트' }).click();
    await mutationResponse;

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('alert')).toContainText(
      '#PROD735Partial 새 알림 뮤트를 설정했어요.',
    );
    const retry = page.getByRole('button', {
      exact: true,
      name: '#PROD735Partial 알림 상태를 불러오지 못했어요. 다시 시도',
    });
    await expect(retry).toBeFocused();

    const rules = await db
      .select()
      .from(HashtagMuteRules)
      .where(
        and(
          eq(HashtagMuteRules.ownerProfileId, viewer.profile!.id),
          eq(HashtagMuteRules.targetHashtagId, hashtag.id),
        ),
      );
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      ...(originalRule ? { id: originalRule.id } : {}),
      decision: action === 'create' ? HashtagMuteDecision.EXCLUDE : HashtagMuteDecision.COLLAPSE,
      expiresAt: null,
      ownerProfileId: viewer.profile!.id,
      scopes:
        action === 'create'
          ? [HashtagMuteScope.NOTIFICATION]
          : [HashtagMuteScope.HOME, HashtagMuteScope.NOTIFICATION],
      targetHashtagId: hashtag.id,
    });

    const retryResponse = waitForGraphQLOperation(page, 'ProfileTagMuteActionRefetchQuery');
    await retry.click();
    await assertGraphQLSuccess(await retryResponse);
    await expect(
      page.getByRole('button', {
        exact: true,
        name: '#PROD735Partial 새 알림 뮤트됨. 설정 변경',
      }),
    ).toBeVisible();
  });
}

test('Notification 범위를 추가·해제할 때 영구인 다른 범위와 selected Profile을 보존한다', async ({
  context,
  page,
}) => {
  const owner = await createE2ESession({ handle: 'prod735-owner-a' });
  const secondProfile = await createE2EAccountProfile({
    accountId: owner.account.id,
    handle: 'prod735-owner-b',
  });
  const target = await createE2EProfile({ handle: 'prod735-shared-target' });
  const hashtag = await createE2EHashtagRelation({
    displayName: 'PROD735Shared',
    name: 'prod735shared',
    profileIds: [target.id],
  });
  const originalRule = await db
    .insert(HashtagMuteRules)
    .values({
      ownerProfileId: owner.profile!.id,
      targetHashtagId: hashtag.id,
      scopes: [HashtagMuteScope.HOME],
      decision: HashtagMuteDecision.COLLAPSE,
      expiresAt: null,
    })
    .returning()
    .then((rows) => rows[0]!);

  await setE2ESessionCookie(context, owner.token);
  await page.setViewportSize({ height: 844, width: 1024 });
  await page.goto(`/@${target.handle}`);

  const firstMuteButton = () =>
    page.getByRole('button', { exact: true, name: '#PROD735Shared 새 알림 뮤트 설정' });
  await firstMuteButton().click();
  await page.getByRole('menuitem', { exact: true, name: '새 알림 뮤트' }).click();
  const addResponse = waitForGraphQLOperation(page, 'ProfileTagMuteActionUpdateMutation');
  await page.getByRole('button', { exact: true, name: '알림 뮤트' }).click();
  await assertGraphQLSuccess(await addResponse);
  await expect(
    page.getByRole('button', { exact: true, name: '#PROD735Shared 새 알림 뮤트됨. 설정 변경' }),
  ).toBeVisible();

  let rule = await db
    .select()
    .from(HashtagMuteRules)
    .where(eq(HashtagMuteRules.id, originalRule.id))
    .then((rows) => rows[0]);
  expect(rule).toMatchObject({
    decision: HashtagMuteDecision.COLLAPSE,
    expiresAt: null,
    scopes: [HashtagMuteScope.HOME, HashtagMuteScope.NOTIFICATION],
  });

  await selectProfileFromSwitcher(page, secondProfile.handle);
  await expect(firstMuteButton()).toBeVisible();
  await expect(
    page.getByRole('button', { exact: true, name: '#PROD735Shared 새 알림 뮤트됨. 설정 변경' }),
  ).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: '새 알림 뮤트 해제' })).toHaveCount(0);

  await selectProfileFromSwitcher(page, owner.profile!.handle);
  const unmuteButton = () =>
    page.getByRole('button', { exact: true, name: '#PROD735Shared 새 알림 뮤트됨. 설정 변경' });
  await expect(unmuteButton()).toBeVisible();
  await unmuteButton().click();
  await page.getByRole('menuitem', { exact: true, name: '새 알림 뮤트 해제' }).click();
  const removeResponse = waitForGraphQLOperation(page, 'ProfileTagMuteActionUpdateMutation');
  await page.getByRole('button', { exact: true, name: '뮤트 해제' }).click();
  await assertGraphQLSuccess(await removeResponse);
  await expect(firstMuteButton()).toBeVisible();

  rule = await db
    .select()
    .from(HashtagMuteRules)
    .where(eq(HashtagMuteRules.id, originalRule.id))
    .then((rows) => rows[0]);
  expect(rule).toMatchObject({
    decision: HashtagMuteDecision.COLLAPSE,
    expiresAt: null,
    scopes: [HashtagMuteScope.HOME],
  });
  expect(
    await db
      .select()
      .from(HashtagMuteRules)
      .where(
        and(
          eq(HashtagMuteRules.ownerProfileId, secondProfile.id),
          eq(HashtagMuteRules.targetHashtagId, hashtag.id),
        ),
      ),
  ).toHaveLength(0);
});

test('다른 범위의 임시 규칙이 있으면 규칙을 변경하지 않고 영구 뮤트 불가 사유를 안내한다', async ({
  context,
  page,
}) => {
  const viewer = await createE2ESession({ handle: 'prod735-temporary-viewer' });
  const target = await createE2EProfile({ handle: 'prod735-temporary-target' });
  const hashtag = await createE2EHashtagRelation({
    displayName: 'PROD735Temporary',
    name: 'prod735temporary',
    profileIds: [target.id],
  });
  const expiresAt = Temporal.Now.instant().add({ hours: 1 });
  const originalRule = await db
    .insert(HashtagMuteRules)
    .values({
      ownerProfileId: viewer.profile!.id,
      targetHashtagId: hashtag.id,
      scopes: [HashtagMuteScope.HOME],
      decision: HashtagMuteDecision.EXCLUDE,
      expiresAt,
    })
    .returning()
    .then((rows) => rows[0]!);

  await setE2ESessionCookie(context, viewer.token);
  await page.goto(`/@${target.handle}`);
  const trigger = page.getByRole('button', {
    exact: true,
    name: '#PROD735Temporary 새 알림 뮤트 불가. 다른 임시 뮤트 규칙이 적용 중',
  });
  await expect(trigger).toBeVisible();
  let mutationCount = 0;
  page.on('request', (request) => {
    const operation = readGraphQLOperation(request.postData());
    if (
      operation &&
      [
        'ProfileTagMuteActionCreateMutation',
        'ProfileTagMuteActionUpdateMutation',
        'ProfileTagMuteActionDeleteMutation',
      ].includes(operation.operationName ?? '')
    ) {
      mutationCount += 1;
    }
  });

  await trigger.click();
  await page.getByRole('menuitem', { name: /다른 범위의 임시 뮤트 규칙이 적용 중/ }).click();
  await expect(page.getByRole('alert')).toContainText(
    '현재 규칙을 보존하며, 만료 후 상태를 새로고침하면 영구 알림 뮤트를 설정할 수 있어요.',
  );
  expect(mutationCount).toBe(0);
  expect(
    await db.select().from(HashtagMuteRules).where(eq(HashtagMuteRules.id, originalRule.id)),
  ).toEqual([originalRule]);
});

async function assertGraphQLSuccess(response: Awaited<ReturnType<typeof waitForGraphQLOperation>>) {
  const body = (await response.json()) as { errors?: unknown[] };
  expect(response.ok(), JSON.stringify(body, null, 2)).toBe(true);
  expect(body.errors, JSON.stringify(body, null, 2)).toBeUndefined();
}

async function selectProfileFromSwitcher(page: Page, handle: string) {
  await page.getByRole('button', { name: '프로필 목록' }).first().click();
  await expect(page.getByLabel('프로필 전환')).toBeVisible();
  const selection = waitForGraphQLOperation(page, 'ProfileSwitcherSelectProfileMutation');
  const profileQuery = waitForGraphQLOperation(page, 'ProfileLayoutQuery');
  await page
    .getByLabel('전환할 프로필 목록')
    .getByRole('button')
    .filter({ hasText: `@${handle}` })
    .click();
  await assertGraphQLSuccess(await selection);
  await assertGraphQLSuccess(await profileQuery);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
}
