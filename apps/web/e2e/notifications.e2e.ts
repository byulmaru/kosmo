import { db, Notifications } from '@kosmo/core/db';
import { eq } from 'drizzle-orm';
import {
  createE2EAccountProfile,
  createE2EFollow,
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

test('Local Follow 알림은 Recipient Profile별로 격리되고 Read와 Unfollow에 수렴한다', async ({
  browser,
  context,
  page,
}) => {
  const recipient = await createE2ESession({
    displayName: 'E2E Recipient A',
    handle: 'e2e-notification-a',
  });
  const recipientProfileB = await createE2EAccountProfile({
    accountId: recipient.account.id,
    displayName: 'E2E Recipient B',
    handle: 'e2e-notification-b',
  });
  const follower = await createE2ESession({
    displayName: 'E2E Notification Follower',
    handle: 'e2e-notification-follower',
  });

  await setE2ESessionCookie(context, recipient.token);
  await page.goto('/notifications');
  await selectProfile(page, recipientProfileB.handle);
  await expect(page.getByText('아직 알림이 없어요')).toBeVisible();

  const followerContext = await browser.newContext();
  const followerPage = await followerContext.newPage();

  try {
    await setE2ESessionCookie(followerContext, follower.token);
    await followerPage.goto(`/@${recipient.profile!.handle}`);
    const followResponse = waitForGraphQLOperation(
      followerPage,
      'FollowButtonFollowProfileMutation',
    );
    await followerPage.getByRole('button', { name: '팔로우' }).click();
    await followResponse;
    await expect(followerPage.getByRole('button', { name: '팔로잉' })).toBeVisible();

    const notification = await db
      .select()
      .from(Notifications)
      .where(eq(Notifications.recipientProfileId, recipient.profile!.id))
      .then(([row]) => row);
    expect(notification).toBeDefined();

    await selectProfile(page, recipient.profile!.handle);
    const unreadNotificationLink = page.getByRole('link', {
      name: /E2E Notification Follower님이 팔로우했습니다.*읽지 않은 알림.*프로필로 이동/,
    });
    await expect(unreadNotificationLink).toBeVisible();
    await expect(page.getByRole('link', { name: '알림, 읽지 않은 알림 1개' })).toBeVisible();

    await selectProfile(page, recipientProfileB.handle);
    await expect(page.getByText('아직 알림이 없어요')).toBeVisible();
    await expect(page.getByRole('link', { name: '알림', exact: true })).toBeVisible();
    await expect(page.getByText('E2E Notification Follower님이 팔로우했습니다')).toHaveCount(0);

    await selectProfile(page, recipient.profile!.handle);
    await expect(unreadNotificationLink).toBeVisible();
    await expect(page.getByRole('link', { name: '알림, 읽지 않은 알림 1개' })).toBeVisible();

    let releaseFirstRead!: () => void;
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    await page.route('**/graphql', async (route) => {
      if (
        readGraphQLOperation(route.request().postData())?.operationName !==
        'NotificationListItemMarkReadMutation'
      ) {
        await route.fallback();
        return;
      }

      const response = await route.fetch();
      await firstReadGate;
      await route.fulfill({ response });
    });

    const firstReadResponse = waitForGraphQLOperation(page, 'NotificationListItemMarkReadMutation');
    await unreadNotificationLink.click();
    await expect(page).toHaveURL(`/@${follower.profile!.handle}`);
    releaseFirstRead();
    await firstReadResponse;
    await page.unroute('**/graphql');

    await expect(page.getByRole('link', { name: '알림', exact: true })).toBeVisible();

    let releaseNotificationRefresh!: () => void;
    const notificationRefreshGate = new Promise<void>((resolve) => {
      releaseNotificationRefresh = resolve;
    });
    await page.route('**/graphql', async (route) => {
      if (
        readGraphQLOperation(route.request().postData())?.operationName !== 'NotificationsPageQuery'
      ) {
        await route.fallback();
        return;
      }

      const response = await route.fetch();
      await notificationRefreshGate;
      await route.fulfill({ response });
    });

    const notificationRefreshResponse = waitForGraphQLOperation(page, 'NotificationsPageQuery');
    await page.getByRole('link', { name: '알림', exact: true }).click();
    await expect(page).toHaveURL('/notifications');
    const readNotificationLink = page.getByRole('link', {
      name: /E2E Notification Follower님이 팔로우했습니다.*프로필로 이동/,
    });
    await expect(readNotificationLink).toBeVisible();
    await expect(readNotificationLink).not.toHaveAccessibleName(/읽지 않은 알림/);
    releaseNotificationRefresh();
    await notificationRefreshResponse;
    await page.unroute('**/graphql');

    const firstReadAt = await notificationReadAt(notification!.id);
    expect(firstReadAt).not.toBeNull();

    const repeatedReadResponse = waitForGraphQLOperation(
      page,
      'NotificationListItemMarkReadMutation',
    );
    await readNotificationLink.click();
    await repeatedReadResponse;
    await expect(page).toHaveURL(`/@${follower.profile!.handle}`);
    expect(await notificationReadAt(notification!.id)).toEqual(firstReadAt);

    const unfollowResponse = waitForGraphQLOperation(
      followerPage,
      'FollowButtonUnfollowProfileMutation',
    );
    await followerPage.getByRole('button', { name: '팔로잉' }).click();
    await unfollowResponse;
    await expect(followerPage.getByRole('button', { name: '팔로우' })).toBeVisible();

    await page.getByRole('link', { name: '알림', exact: true }).click();
    await expect(page).toHaveURL('/notifications');
    await expect(page.getByText('아직 알림이 없어요')).toBeVisible();
    await expect(page.getByRole('link', { name: '알림', exact: true })).toBeVisible();
    expect(
      await db.select().from(Notifications).where(eq(Notifications.id, notification!.id)),
    ).toEqual([]);

    const notificationId = toGlobalId('FollowNotification', notification!.id);
    const nodeResult = await mutateGraphQL(
      page,
      `query E2ENotificationNode($id: ID!) {
        node(id: $id) { id }
      }`,
      { id: notificationId },
    );
    expect(nodeResult.errors).toBeUndefined();
    expect(nodeResult.data?.node).toBeNull();

    const readResult = await mutateGraphQL(
      page,
      `mutation E2EMarkDeletedNotificationRead($ids: [ID!]!) {
        markNotificationRead(input: { ids: $ids }) {
          notifications { id }
          recipientProfiles { id }
        }
      }`,
      { ids: [notificationId] },
    );
    expect(readResult.errors).toBeUndefined();
    const payload = readResult.data?.markNotificationRead;
    expect(payload).toBeDefined();
    if (payload == null) {
      throw new Error('markNotificationRead payload is missing');
    }
    expect(payload.notifications).toEqual([]);
    expect(payload.recipientProfiles).toEqual([]);
  } finally {
    await followerContext.close();
  }
});

test('Web 모두 읽음은 current loaded unread만 한 번 요청하고 실패 재시도에서 상태를 보존한다', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 767 });

  const recipient = await createE2ESession({
    displayName: 'E2E Batch Recipient',
    handle: 'e2e-batch-recipient',
  });
  const firstFollower = await createE2ESession({
    displayName: 'E2E Batch Follower A',
    handle: 'e2e-batch-follower-a',
  });
  const secondFollower = await createE2ESession({
    displayName: 'E2E Batch Follower B',
    handle: 'e2e-batch-follower-b',
  });
  const outsideFollower = await createE2ESession({
    displayName: 'E2E Batch Follower C',
    handle: 'e2e-batch-follower-c',
  });

  if (!recipient.profile || !firstFollower.profile || !secondFollower.profile) {
    throw new Error('Batch Read fixtures require local profiles.');
  }

  await createE2EFollow({
    followeeProfileId: recipient.profile.id,
    followerProfileId: firstFollower.profile.id,
  });
  await createE2EFollow({
    followeeProfileId: recipient.profile.id,
    followerProfileId: secondFollower.profile.id,
  });

  await setE2ESessionCookie(context, recipient.token);
  await page.goto('/notifications');
  await expect(
    page.getByRole('link', {
      name: /E2E Batch Follower A님이 팔로우했습니다.*읽지 않은 알림/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: /E2E Batch Follower B님이 팔로우했습니다.*읽지 않은 알림/,
    }),
  ).toBeVisible();

  const initialRows = await db
    .select()
    .from(Notifications)
    .where(eq(Notifications.recipientProfileId, recipient.profile.id));
  expect(initialRows).toHaveLength(2);
  const initialGlobalIds = initialRows.map(({ id }) => toGlobalId('FollowNotification', id));

  await createE2EFollow({
    followeeProfileId: recipient.profile.id,
    followerProfileId: outsideFollower.profile!.id,
  });
  const outsideRow = await db
    .select()
    .from(Notifications)
    .where(eq(Notifications.recipientProfileId, recipient.profile.id))
    .then((rows) => rows.find((row) => !initialRows.some(({ id }) => id === row.id)));
  if (!outsideRow) {
    throw new Error('Batch Read fixture did not create the outside Notification.');
  }

  const requestIds: string[][] = [];
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName !== 'NotificationListMarkAllReadMutation') {
      await route.fallback();
      return;
    }

    requestIds.push((operation.variables?.ids as string[] | undefined) ?? []);
    await route.fallback();
  });

  await page.getByRole('button', { name: '모두 읽음' }).click();
  await expect(page.getByRole('button', { name: '모두 읽음' })).toBeDisabled();
  await expect(
    page.getByRole('link', { name: /E2E Batch Follower A님이 팔로우했습니다/ }),
  ).not.toHaveAccessibleName(/읽지 않은 알림/);
  await expect(
    page.getByRole('link', { name: /E2E Batch Follower B님이 팔로우했습니다/ }),
  ).not.toHaveAccessibleName(/읽지 않은 알림/);
  expect(requestIds).toHaveLength(1);
  expect([...requestIds[0]!].sort()).toEqual([...initialGlobalIds].sort());
  for (const row of initialRows) {
    expect(await notificationReadAt(row.id)).not.toBeNull();
  }
  expect(await notificationReadAt(outsideRow.id)).toBeNull();
  await expect(
    page.getByRole('link', { name: '알림, 읽지 않은 알림 1개', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.unroute('**/graphql');

  const retryFollower = await createE2ESession({
    displayName: 'E2E Batch Follower D',
    handle: 'e2e-batch-follower-d',
  });
  const freshFollower = await createE2ESession({
    displayName: 'E2E Batch Follower E',
    handle: 'e2e-batch-follower-e',
  });
  await createE2EFollow({
    followeeProfileId: recipient.profile.id,
    followerProfileId: retryFollower.profile!.id,
  });

  const retryRow = await db
    .select()
    .from(Notifications)
    .where(eq(Notifications.recipientProfileId, recipient.profile.id))
    .then((rows) =>
      rows.find((row) => row.id !== outsideRow.id && !initialRows.some(({ id }) => id === row.id)),
    );
  if (!retryRow) {
    throw new Error('Batch Read fixture did not create the retry Notification.');
  }

  await page.getByRole('link', { name: '홈', exact: true }).click();
  await expect(page).toHaveURL('/home');
  await page.getByRole('link', { name: /^알림/ }).first().click();
  await expect(page).toHaveURL('/notifications');
  await expect(
    page.getByRole('link', { name: /E2E Batch Follower C님이 팔로우했습니다.*읽지 않은 알림/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /E2E Batch Follower D님이 팔로우했습니다.*읽지 않은 알림/ }),
  ).toBeVisible();

  let failNextReadAll = true;
  const retryRequestIds: string[][] = [];
  await page.route('**/graphql', async (route) => {
    const operation = readGraphQLOperation(route.request().postData());
    if (operation?.operationName !== 'NotificationListMarkAllReadMutation') {
      await route.fallback();
      return;
    }

    retryRequestIds.push((operation.variables?.ids as string[] | undefined) ?? []);
    if (failNextReadAll) {
      failNextReadAll = false;
      await route.abort();
      return;
    }
    await route.fallback();
  });

  await page.getByRole('button', { name: '모두 읽음' }).click();
  await expect(page.getByRole('alert')).toContainText('알림을 모두 읽지 못했어요.');
  expect(await notificationReadAt(outsideRow.id)).toBeNull();
  expect(await notificationReadAt(retryRow.id)).toBeNull();

  await createE2EFollow({
    followeeProfileId: recipient.profile.id,
    followerProfileId: freshFollower.profile!.id,
  });
  const freshRow = await db
    .select()
    .from(Notifications)
    .where(eq(Notifications.recipientProfileId, recipient.profile.id))
    .then((rows) =>
      rows.find(
        (row) =>
          row.id !== outsideRow.id &&
          row.id !== retryRow.id &&
          !initialRows.some(({ id }) => id === row.id),
      ),
    );
  if (!freshRow) {
    throw new Error('Batch Read fixture did not create the fresh retry Notification.');
  }

  await page.getByRole('link', { name: '홈', exact: true }).click();
  await expect(page).toHaveURL('/home');
  await page.getByRole('link', { name: /^알림/ }).first().click();
  await expect(page).toHaveURL('/notifications');
  await expect(
    page.getByRole('link', { name: /E2E Batch Follower D님이 팔로우했습니다.*읽지 않은 알림/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /E2E Batch Follower E님이 팔로우했습니다.*읽지 않은 알림/ }),
  ).toBeVisible();

  const retryResponse = waitForGraphQLOperation(page, 'NotificationListMarkAllReadMutation');
  await page.getByRole('button', { name: '다시 시도' }).click();
  await retryResponse;
  await expect(page.getByRole('button', { name: '모두 읽음' })).toBeDisabled();
  expect(retryRequestIds).toHaveLength(2);
  expect([...retryRequestIds[0]!].sort()).toEqual(
    [
      toGlobalId('FollowNotification', outsideRow.id),
      toGlobalId('FollowNotification', retryRow.id),
    ].sort(),
  );
  expect(retryRequestIds[1]).toContain(toGlobalId('FollowNotification', outsideRow.id));
  expect(retryRequestIds[1]).toContain(toGlobalId('FollowNotification', retryRow.id));
  expect(retryRequestIds[1]).toContain(toGlobalId('FollowNotification', freshRow.id));
  expect(await notificationReadAt(outsideRow.id)).not.toBeNull();
  expect(await notificationReadAt(retryRow.id)).not.toBeNull();
  expect(await notificationReadAt(freshRow.id)).not.toBeNull();
  await page.unroute('**/graphql');
});

async function selectProfile(page: Page, handle: string) {
  const response = waitForGraphQLOperation(page, 'ProfileSwitcherSelectProfileMutation');

  await page.getByRole('button', { name: '프로필 목록' }).first().click();
  await page
    .getByLabel('전환할 프로필 목록')
    .getByRole('button')
    .filter({ hasText: `@${handle}` })
    .click();
  await response;
  await expect(page.getByRole('progressbar')).toHaveCount(0);
}

async function notificationReadAt(id: string) {
  return await db
    .select({ readAt: Notifications.readAt })
    .from(Notifications)
    .where(eq(Notifications.id, id))
    .then(([row]) => row?.readAt ?? null);
}

type JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

async function mutateGraphQL(page: Page, query: string, variables: Record<string, JsonValue>) {
  const body = JSON.stringify({ query, variables });

  return await page.evaluate(
    async ({ body }) => {
      const response = await fetch('/graphql', {
        body,
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      return (await response.json()) as {
        data?: Record<string, Record<string, unknown> | null>;
        errors?: Array<{ extensions?: { code?: string } }>;
      };
    },
    { body },
  );
}
