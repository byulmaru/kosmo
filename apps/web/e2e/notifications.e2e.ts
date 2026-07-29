import { db, Notifications } from '@kosmo/core/db';
import { eq } from 'drizzle-orm';
import {
  createE2EAccountProfile,
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
      `mutation E2EMarkDeletedNotificationRead($id: ID!) {
        markNotificationRead(input: { id: $id }) {
          notification { id }
        }
      }`,
      { id: notificationId },
    );
    expect(readResult.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    expect(readResult.data?.markNotificationRead ?? null).toBeNull();
  } finally {
    await followerContext.close();
  }
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

async function mutateGraphQL(page: Page, query: string, variables: Record<string, string>) {
  return await page.evaluate(
    async ({ query, variables }) => {
      const response = await fetch('/graphql', {
        body: JSON.stringify({ query, variables }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      return (await response.json()) as {
        data?: Record<string, Record<string, unknown> | null>;
        errors?: Array<{ extensions?: { code?: string } }>;
      };
    },
    { query, variables },
  );
}
