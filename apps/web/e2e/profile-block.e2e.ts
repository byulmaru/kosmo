import {
  Bookmarks,
  db,
  Notifications,
  Posts,
  ProfileBlocks,
  ProfileFollowRequests,
  ProfileFollows,
  Reactions,
} from '@kosmo/core/db';
import { NotificationKind } from '@kosmo/core/enums';
import { and, eq, inArray } from 'drizzle-orm';
import {
  createE2EAccountProfile,
  createE2EFollow,
  createE2EHashtagRelation,
  createE2EPost,
  createE2EProfile,
  createE2ERemoteProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { isGraphQLOperation, toGlobalId, waitForGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('UI Block 성공은 양방향 Follow·Request cleanup을 완료하고 보존 대상과 Unblock no-restore를 유지한다', async ({
  context,
  page,
}) => {
  const owner = await createE2ESession({ handle: 'e2e-block-owner' });
  const target = await createE2ESession({
    displayName: 'E2E Block Target',
    handle: 'e2e-block-target',
  });
  const ownerId = owner.profile!.id;
  const targetId = target.profile!.id;
  const ownerPost = await createE2EPost({
    body: 'E2E owner private direction',
    profileId: ownerId,
  });
  const targetPost = await createE2EPost({
    body: 'E2E target revealed content',
    media: [{ altText: 'E2E target media', url: 'https://media.example/block.png' }],
    profileId: targetId,
  });
  const pairs = [
    { followerProfileId: ownerId, followeeProfileId: targetId },
    { followerProfileId: targetId, followeeProfileId: ownerId },
  ];
  const follows = [];
  for (const pair of pairs) {
    follows.push(await createE2EFollow(pair));
  }
  const requests = await db.insert(ProfileFollowRequests).values(pairs).returning();
  await db.insert(Notifications).values(
    requests.map((request) => ({
      kind: NotificationKind.FOLLOW_REQUEST,
      recipientProfileId: request.followeeProfileId,
      sourceId: request.id,
    })),
  );
  const [reaction] = await db
    .insert(Reactions)
    .values({
      postId: targetPost.id,
      profileId: ownerId,
      type: '❤️',
    })
    .returning();
  const [bookmark] = await db
    .insert(Bookmarks)
    .values({ postId: targetPost.id, profileId: ownerId })
    .returning();
  const repost = await createE2EPost({
    content: false,
    profileId: ownerId,
    repostSourceId: targetPost.id,
  });
  const [preservedNotification] = await db
    .insert(Notifications)
    .values({
      kind: NotificationKind.REACTION,
      recipientProfileId: targetId,
      sourceId: reaction!.id,
      readAt: null,
    })
    .returning();
  const sourceIds = [...follows, ...requests].map(({ id }) => id);
  expect(await db.$count(Notifications, inArray(Notifications.sourceId, sourceIds))).toBe(4);

  const preservedState = async () => ({
    reaction: await db.select().from(Reactions).where(eq(Reactions.id, reaction!.id)),
    bookmark: await db.select().from(Bookmarks).where(eq(Bookmarks.id, bookmark!.id)),
    repost: await db.select().from(Posts).where(eq(Posts.id, repost.id)),
    notification: await db
      .select()
      .from(Notifications)
      .where(eq(Notifications.id, preservedNotification!.id)),
  });
  const before = await preservedState();
  await setE2ESessionCookie(context, owner.token);
  await page.goto(`/@${target.profile!.handle}`);
  await expect(page.getByText('E2E target revealed content', { exact: true })).toBeVisible();
  await blockFromProfile(page);

  // Inspect captured cleanup and preserved rows after confirmed UI success.
  expect(
    await db.$count(
      ProfileFollows,
      inArray(
        ProfileFollows.id,
        follows.map(({ id }) => id),
      ),
    ),
  ).toBe(0);
  expect(
    await db.$count(
      ProfileFollowRequests,
      inArray(
        ProfileFollowRequests.id,
        requests.map(({ id }) => id),
      ),
    ),
  ).toBe(0);
  expect(await db.$count(Notifications, inArray(Notifications.sourceId, sourceIds))).toBe(0);
  expect(await preservedState()).toEqual(before);
  const [block] = await db
    .select()
    .from(ProfileBlocks)
    .where(
      and(eq(ProfileBlocks.ownerProfileId, ownerId), eq(ProfileBlocks.targetProfileId, targetId)),
    );
  expect(block).toBeDefined();
  const directAfterBlock = await requestGraphQL<{
    profileByHandle: { posts: { edges: { node: { id: string } }[] } };
  }>(
    page,
    owner.token,
    'query DirectAfterBlock($handle: String!) { profileByHandle(handle: $handle) { posts(first: 10) { edges { node { id } } } } }',
    { handle: target.profile!.handle },
  );
  expect(directAfterBlock.profileByHandle.posts.edges).toContainEqual({
    node: { id: toGlobalId('Post', targetPost.id) },
  });
  await expect(page.getByText('차단한 프로필의 게시물입니다', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E target revealed content', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '게시물 보기', exact: true }).click();
  await expect(page.getByText('E2E target revealed content', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('차단한 프로필의 게시물입니다', { exact: true })).toBeVisible();

  const directQuery = `query BlockDirect($profileId: ID!, $postId: ID!, $handle: String!) {
    profile: node(id: $profileId) { id ... on Profile { posts(first: 10) { edges { node { id } } } } }
    profileByHandle(handle: $handle) { id }
    post: node(id: $postId) { id ... on Post { content { media { id } } } }
    searchProfiles(query: $handle, first: 10) { edges { node { id } } }
  }`;
  type DirectResult = {
    profile: { id: string; posts: { edges: { node: { id: string } }[] } };
    profileByHandle: { id: string };
    post: { id: string; content: { media: { id: string }[] } } | null;
    searchProfiles: { edges: { node: { id: string } }[] };
  };
  const ownerView = await requestGraphQL<DirectResult>(page, owner.token, directQuery, {
    profileId: toGlobalId('Profile', targetId),
    postId: toGlobalId('Post', targetPost.id),
    handle: target.profile!.handle,
  });
  expect(ownerView.profile.id).toBe(toGlobalId('Profile', targetId));
  expect(ownerView.profileByHandle.id).toBe(toGlobalId('Profile', targetId));
  expect(ownerView.post?.id).toBe(toGlobalId('Post', targetPost.id));
  expect(ownerView.post?.content.media).toHaveLength(1);
  expect(ownerView.profile.posts.edges).toContainEqual({
    node: { id: toGlobalId('Post', targetPost.id) },
  });
  expect(ownerView.searchProfiles.edges).toEqual([]);
  const targetView = await requestGraphQL<DirectResult>(page, target.token, directQuery, {
    profileId: toGlobalId('Profile', ownerId),
    postId: toGlobalId('Post', ownerPost.id),
    handle: owner.profile!.handle,
  });
  expect(targetView.profile.id).toBe(toGlobalId('Profile', ownerId));
  expect(targetView.profileByHandle.id).toBe(toGlobalId('Profile', ownerId));
  expect(targetView.post).toBeNull();
  expect(targetView.profile.posts.edges).toEqual([]);
  expect(targetView.searchProfiles.edges).toEqual([]);

  // A cold Settings route gets the exact Owner relationship ID from the server.
  await page.goto('/settings/blocked-profiles');
  await page.getByRole('button', { name: /E2E Block Target.*차단 해제/u }).click();
  await confirmUnblock(page);
  expect(await db.$count(ProfileBlocks, eq(ProfileBlocks.id, block!.id))).toBe(0);
  expect(
    await db.$count(ProfileFollows, inArray(ProfileFollows.followerProfileId, [ownerId, targetId])),
  ).toBe(0);
  expect(
    await db.$count(
      ProfileFollowRequests,
      inArray(ProfileFollowRequests.followerProfileId, [ownerId, targetId]),
    ),
  ).toBe(0);
  expect(await preservedState()).toEqual(before);
  await page.goto(`/@${target.profile!.handle}`);
  await expect(page.getByRole('button', { name: '팔로우', exact: true })).toBeVisible();
  await expect(page.getByText('E2E target revealed content', { exact: true })).toBeVisible();
});

test('Remote Target의 직접 route·Settings 차단 상태는 selected Profile 전환과 해제에 따라 격리된다', async ({
  context,
  page,
}) => {
  const owner = await createE2ESession({ handle: 'e2e-block-actor-a' });
  const second = await createE2EAccountProfile({
    accountId: owner.account.id,
    handle: 'e2e-block-actor-b',
  });
  const domain = 'e2e-block.remote.example';
  const target = await createE2ERemoteProfile({
    displayName: 'E2E Remote Block Target',
    domain,
    handle: 'e2e-block-remote',
    instanceState: 'UNRESPONSIVE',
  });
  const route = `/@${target.handle}@${domain}`;
  await createE2EPost({ body: 'E2E remote block content', profileId: target.id });
  await setE2ESessionCookie(context, owner.token);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(route);
  await expect(page.getByText('E2E remote block content', { exact: true })).toBeVisible();
  await blockFromProfile(page);
  await page.getByRole('button', { name: '게시물 보기', exact: true }).click();
  await expect(page.getByText('E2E remote block content', { exact: true })).toBeVisible();
  // The profile switcher is in the desktop sidebar; keep the current route mounted.
  await page.setViewportSize({ height: 900, width: 1440 });
  await selectProfile(page, second.handle);
  await expect(page.getByText('차단한 프로필의 게시물입니다', { exact: true })).toHaveCount(0);
  await expect(page.getByText('E2E remote block content', { exact: true })).toBeVisible();
  await selectProfile(page, owner.profile!.handle);
  await expect(page.getByText('차단한 프로필의 게시물입니다', { exact: true })).toBeVisible();
  await expect(page.getByText('E2E remote block content', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/settings/blocked-profiles');
  await page.getByRole('button', { name: /E2E Remote Block Target.*차단 해제/u }).click();
  await confirmUnblock(page);
  await expect(
    page.getByRole('button', { name: /E2E Remote Block Target.*차단 해제/u }),
  ).toHaveCount(0);
  expect(await db.$count(ProfileBlocks, eq(ProfileBlocks.targetProfileId, target.id))).toBe(0);
  await page.goto(route);
  await expect(page.getByText('E2E remote block content', { exact: true })).toBeVisible();
});

test('Block 실패 후 재시도와 상호 차단에서 자신의 exact 관계만 해제하는 흐름을 유지한다', async ({
  context,
  page,
}) => {
  const owner = await createE2ESession();
  const target = await createE2ESession({ displayName: 'E2E Mutual Target' });
  await createE2EPost({ body: 'Mutual block content', profileId: target.profile!.id });
  await setE2ESessionCookie(context, owner.token);
  let attempts = 0;
  await page.route('**/graphql', async (route) => {
    if (!isGraphQLOperation(route.request().postData(), 'ProfileBlockActionBlockMutation')) {
      await route.fallback();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'E2E forced Block failure' }] }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto(`/@${target.profile!.handle}`);
  const cancelled = await openBlockConfirmation(page);
  await expect(cancelled.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cancelled).toHaveCount(0);
  expect(attempts).toBe(0);
  await expect(page.getByRole('button', { name: '더보기', exact: true })).toBeFocused();
  const failed = await openBlockConfirmation(page);
  await failed.getByRole('button', { name: '차단', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    '프로필을 차단하지 못했어요. 다시 시도해 주세요.',
  );
  await expect(failed).toHaveCount(0);
  await expect(page.getByRole('button', { name: '더보기', exact: true })).toBeFocused();
  await expect(page.getByText('Mutual block content', { exact: true })).toBeVisible();
  expect(await db.$count(ProfileBlocks)).toBe(0);
  await blockFromProfile(page);
  expect(attempts).toBe(2);
  const reverse = await requestGraphQL<{ blockProfile: { profileBlock: { id: string } } }>(
    page,
    target.token,
    'mutation MutualBlock($id: ID!) { blockProfile(input: { id: $id }) { profileBlock { id } } }',
    { id: toGlobalId('Profile', owner.profile!.id) },
  );
  await page.reload();
  await expect(page.getByText('이 프로필을 볼 수 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '게시물 보기', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /E2E Mutual Target.*차단 해제/u }).click();
  await confirmUnblock(page);
  await expect(page.getByText('이 프로필을 볼 수 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByText('Mutual block content', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /E2E Mutual Target.*차단 해제/u })).toHaveCount(0);
  const remaining = await db.select().from(ProfileBlocks);
  expect(remaining).toHaveLength(1);
  expect(toGlobalId('ProfileBlock', remaining[0]!.id)).toBe(reverse.blockProfile.profileBlock.id);
  expect(remaining[0]!.ownerProfileId).toBe(target.profile!.id);
});

for (const targetKind of ['Local', 'Remote'] as const) {
  test(`${targetKind} Target Block 성공 후 실제 API의 목록·Bookmark·Notification·신규 상호작용 정책이 적용된다`, async ({
    page,
  }) => {
    const owner = await createE2ESession();
    const targetSession = targetKind === 'Local' ? await createE2ESession() : null;
    const target =
      targetSession?.profile ??
      (await createE2ERemoteProfile({
        domain: 'block-policy.remote.example',
        instanceState: 'UNRESPONSIVE',
      }));
    const control = await createE2EProfile();
    const ownerPost = await createE2EPost({
      body: 'Owner policy content',
      profileId: owner.profile!.id,
    });
    const targetPost = await createE2EPost({ body: 'Target policy content', profileId: target.id });
    const controlPost = await createE2EPost({ body: 'Visible control', profileId: control.id });
    const hashtag = await createE2EHashtagRelation({
      displayName: 'Block policy',
      name: 'block-policy',
      profileIds: [owner.profile!.id, target.id, control.id],
    });
    const actors = [
      {
        profile: owner.profile!,
        token: owner.token,
        post: ownerPost,
        other: target,
        otherPost: targetPost,
      },
      ...(targetSession
        ? [
            {
              profile: target,
              token: targetSession.token,
              post: targetPost,
              other: owner.profile!,
              otherPost: ownerPost,
            },
          ]
        : []),
    ];
    await db.insert(ProfileFollows).values([
      { followerProfileId: owner.profile!.id, followeeProfileId: target.id },
      { followerProfileId: target.id, followeeProfileId: owner.profile!.id },
      { followerProfileId: owner.profile!.id, followeeProfileId: control.id },
      { followerProfileId: target.id, followeeProfileId: control.id },
      { followerProfileId: control.id, followeeProfileId: owner.profile!.id },
      { followerProfileId: control.id, followeeProfileId: target.id },
    ]);
    const fixtures = [];
    for (const actor of actors) {
      const [bookmark] = await db
        .insert(Bookmarks)
        .values({ profileId: actor.profile.id, postId: actor.otherPost.id })
        .returning();
      const [hiddenReaction, visibleReaction] = await db
        .insert(Reactions)
        .values([
          { profileId: actor.other.id, postId: actor.post.id, type: '❤️' },
          { profileId: control.id, postId: actor.post.id, type: '❤️' },
        ])
        .returning();
      const [hidden, visible] = await db
        .insert(Notifications)
        .values([
          {
            kind: NotificationKind.REACTION,
            recipientProfileId: actor.profile.id,
            sourceId: hiddenReaction!.id,
          },
          {
            kind: NotificationKind.REACTION,
            recipientProfileId: actor.profile.id,
            sourceId: visibleReaction!.id,
          },
        ])
        .returning();
      fixtures.push({ ...actor, bookmark: bookmark!, hidden: hidden!, visible: visible! });
    }
    type Connection = { edges: { node: { id: string } }[] };
    type PolicyResult = {
      homeTimeline: Connection;
      localTimeline: Connection;
      viewer: {
        bookmarks: { edges: { node: { post: { id: string } } }[] };
        notifications: Connection;
        unreadNotificationCount: number;
      };
      control: {
        followers: { edges: { node: { follower: { id: string } } }[] };
        following: { edges: { node: { followee: { id: string } } }[] };
      };
      hashtag: { relatedProfiles: Connection };
      notification: { id: string } | null;
    };
    const query = `query BlockPolicyConsumers($viewer: ID!, $control: ID!, $hashtag: ID!, $notification: ID!) {
      homeTimeline(first: 20) { edges { node { id } } }
      localTimeline(first: 20) { edges { node { id } } }
      viewer: node(id: $viewer) { ... on Profile {
        bookmarks(first: 20) { edges { node { post { id } } } }
        notifications(first: 20) { edges { node { id } } }
        unreadNotificationCount
      } }
      control: node(id: $control) { ... on Profile {
        followers(first: 20) { edges { node { follower { id } } } }
        following(first: 20) { edges { node { followee { id } } } }
      } }
      hashtag: node(id: $hashtag) { ... on Hashtag { relatedProfiles(first: 20) { edges { node { id } } } } }
      notification: node(id: $notification) { id }
    }`;
    const readPolicy = (actor: (typeof fixtures)[number]) =>
      requestGraphQL<PolicyResult>(page, actor.token, query, {
        viewer: toGlobalId('Profile', actor.profile.id),
        control: toGlobalId('Profile', control.id),
        hashtag: toGlobalId('Hashtag', hashtag.id),
        notification: toGlobalId('ReactionNotification', actor.hidden.id),
      });
    for (const actor of fixtures) {
      const before = await readPolicy(actor);
      expect(before.homeTimeline.edges).toContainEqual({
        node: { id: toGlobalId('Post', actor.otherPost.id) },
      });
      expect(before.localTimeline.edges).toContainEqual({
        node: { id: toGlobalId('Post', controlPost.id) },
      });
      if (targetKind === 'Local') {
        expect(before.localTimeline.edges).toContainEqual({
          node: { id: toGlobalId('Post', actor.otherPost.id) },
        });
      } else {
        // Remote posts are outside the Local timeline even before Block.
        expect(before.localTimeline.edges).not.toContainEqual({
          node: { id: toGlobalId('Post', actor.otherPost.id) },
        });
      }
      expect(before.viewer.bookmarks.edges).toHaveLength(1);
      expect(before.viewer.unreadNotificationCount).toBe(2);
      expect(before.notification?.id).toBe(toGlobalId('ReactionNotification', actor.hidden.id));
      expect(before.hashtag.relatedProfiles.edges).toContainEqual({
        node: { id: toGlobalId('Profile', actor.other.id) },
      });
      expect(before.control.followers.edges.map(({ node }) => node.follower.id)).toContain(
        toGlobalId('Profile', actor.other.id),
      );
      expect(before.control.following.edges.map(({ node }) => node.followee.id)).toContain(
        toGlobalId('Profile', actor.other.id),
      );
    }
    const created = await requestGraphQL<{
      blockProfile: { success: boolean; profileBlock: { id: string } };
    }>(
      page,
      owner.token,
      'mutation BlockPolicyPair($id: ID!) { blockProfile(input: {id: $id}) { success profileBlock { id } } }',
      { id: toGlobalId('Profile', target.id) },
    );
    expect(created.blockProfile.success).toBe(true);
    for (const [index, actor] of fixtures.entries()) {
      const after = await readPolicy(actor);
      const otherId = toGlobalId('Profile', actor.other.id);
      for (const timeline of [after.homeTimeline, after.localTimeline]) {
        expect(timeline.edges).not.toContainEqual({
          node: { id: toGlobalId('Post', actor.otherPost.id) },
        });
        expect(timeline.edges).toContainEqual({ node: { id: toGlobalId('Post', controlPost.id) } });
      }
      expect(after.viewer.bookmarks.edges).toEqual(
        index === 0 ? [{ node: { post: { id: toGlobalId('Post', targetPost.id) } } }] : [],
      );
      expect(after.control.followers.edges.map(({ node }) => node.follower.id)).not.toContain(
        otherId,
      );
      expect(after.control.following.edges.map(({ node }) => node.followee.id)).not.toContain(
        otherId,
      );
      expect(after.hashtag.relatedProfiles.edges).not.toContainEqual({ node: { id: otherId } });
      expect(after.hashtag.relatedProfiles.edges).toContainEqual({
        node: { id: toGlobalId('Profile', control.id) },
      });
      expect(after.notification).toBeNull();
      expect(after.viewer.notifications.edges).toEqual([
        { node: { id: toGlobalId('ReactionNotification', actor.visible.id) } },
      ]);
      expect(after.viewer.unreadNotificationCount).toBe(1);
      const marked = await requestGraphQL<{
        markNotificationRead: { notifications: { id: string }[] };
      }>(
        page,
        actor.token,
        'mutation ReadHiddenBlockNotification($id: ID!) { markNotificationRead(input: { ids: [$id] }) { notifications { id } } }',
        { id: toGlobalId('ReactionNotification', actor.hidden.id) },
      );
      expect(marked.markNotificationRead.notifications).toEqual([]);
      expect(
        await db.select().from(Notifications).where(eq(Notifications.id, actor.hidden.id)),
      ).toEqual([actor.hidden]);
      const stateBefore = {
        follows: await db.$count(ProfileFollows),
        requests: await db.$count(ProfileFollowRequests),
        reactions: await db.$count(Reactions),
        posts: await db.$count(Posts),
        notifications: await db.$count(Notifications),
      };
      const mutations = [
        'followProfile(input: { id: $profile }) { result { __typename } }',
        'addReaction(input: { postId: $post, type: "🎉" }) { reaction { id } }',
        'repostPost(input: { sourceId: $post }) { repost { id } }',
        'createPost(input: { bodyText: "blocked reply", visibility: PUBLIC, replyParentId: $post }) { post { id } }',
        'createPost(input: { bodyText: "blocked quote", visibility: PUBLIC, repostSourceId: $post }) { post { id } }',
      ];
      for (const mutation of mutations) {
        const isFollow = mutation.startsWith('followProfile');
        const response = await page.request.post('/graphql', {
          headers: { Authorization: `Bearer ${actor.token}` },
          data: {
            query: `mutation BlockedInteraction(${isFollow ? '$profile' : '$post'}: ID!) { ${mutation} }`,
            variables: { profile: otherId, post: toGlobalId('Post', actor.otherPost.id) },
          },
        });
        expect(response.ok()).toBe(true);
        const result = await response.json();
        expect(
          result.errors?.map((error: { extensions: { code: string } }) => error.extensions.code),
          mutation,
        ).toEqual(['NOT_FOUND']);
      }
      expect({
        follows: await db.$count(ProfileFollows),
        requests: await db.$count(ProfileFollowRequests),
        reactions: await db.$count(Reactions),
        posts: await db.$count(Posts),
        notifications: await db.$count(Notifications),
      }).toEqual(stateBefore);
    }
  });
}

async function blockFromProfile(page: Page) {
  const dialog = await openBlockConfirmation(page);
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  const response = waitForGraphQLOperation(page, 'ProfileBlockActionBlockMutation');
  await dialog.getByRole('button', { name: '차단', exact: true }).click();
  const result = await (await response).json();
  expect(result.errors).toBeUndefined();
  expect(result.data.blockProfile.success).toBe(true);
  expect(result.data.blockProfile.profileBlock.id).toEqual(expect.any(String));
  await expect(page.getByRole('alert')).toContainText('프로필을 차단했어요');
}

async function openBlockConfirmation(page: Page) {
  await page.getByRole('button', { name: '더보기', exact: true }).click();
  await page.getByRole('menuitem', { name: '차단', exact: true }).click();
  return page.getByRole('dialog', { name: '이 프로필을 차단할까요?' }).last();
}

async function confirmUnblock(page: Page) {
  const dialog = page.getByRole('dialog', { name: '이 프로필의 차단을 해제할까요?' }).last();
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  const response = waitForGraphQLOperation(page, 'ProfileBlockActionUnblockMutation');
  await dialog.getByRole('button', { name: '차단 해제', exact: true }).click();
  const result = await (await response).json();
  expect(result.errors).toBeUndefined();
  expect(result.data.unblockProfile.success).toBe(true);
  expect(result.data.unblockProfile.profileBlockId).toEqual(expect.any(String));
  await expect(page.getByRole('alert')).toContainText('차단을 해제했어요');
}

async function selectProfile(page: Page, handle: string) {
  await page.getByRole('button', { name: '프로필 목록' }).first().click();
  const response = waitForGraphQLOperation(page, 'ProfileSwitcherSelectProfileMutation');
  await page
    .getByLabel('전환할 프로필 목록')
    .getByRole('button')
    .filter({ hasText: `@${handle}` })
    .click();
  await response;
  await expect(page.getByRole('progressbar')).toHaveCount(0);
}

async function requestGraphQL<T>(
  page: Page,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await page.request.post('/graphql', {
    data: { query, variables },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.errors).toBeUndefined();
  return result.data as T;
}
