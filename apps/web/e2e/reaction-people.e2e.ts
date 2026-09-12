import { db, Reactions } from '@kosmo/core/db';
import { Temporal } from 'temporal-polyfill';
import {
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { toGlobalId } from './graphql';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('목록에서 People로 이동하고 Type과 프로필 방문 후 원래 목록 위치를 복원한다', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  const viewer = await createE2ESession({ handle: 'e2e-people-viewer' });
  const heartProfile = await createE2EProfile({ handle: 'e2e-heart', displayName: '하트 사용자' });
  const partyProfile = await createE2EProfile({ handle: 'e2e-party', displayName: '축하 사용자' });
  const post = await createE2EPost({ body: '반응 목록 복귀 대상', profileId: viewer.profile!.id });
  await db.insert(Reactions).values([
    {
      createdAt: Temporal.Instant.from('2026-09-01T00:00:00Z'),
      postId: post.id,
      profileId: heartProfile.id,
      type: '❤️',
    },
    {
      createdAt: Temporal.Instant.from('2026-09-01T00:00:01Z'),
      postId: post.id,
      profileId: partyProfile.id,
      type: '🎉',
    },
  ]);
  for (let index = 0; index < 6; index += 1) {
    await createE2EPost({ body: `목록 스크롤용 게시글 ${index}`, profileId: viewer.profile!.id });
  }
  await setE2ESessionCookie(context, viewer.token);
  await page.goto('/home');
  const peoplePath = `/@${viewer.profile!.handle}/${toGlobalId('Post', post.id)}/reactions`;
  const entry = page.locator(`a[href="${peoplePath}"]`);
  await entry.scrollIntoViewIfNeeded();
  const originalControlId = await entry.getAttribute('id');
  expect(originalControlId).toBeTruthy();
  const previousScroll = await page.evaluate(() => window.scrollY);
  expect(previousScroll).toBeGreaterThan(0);
  await entry.click();

  const heading = page.getByRole('heading', { name: '반응한 사람', exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '주요 메뉴', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /❤️/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('하트 사용자', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /🎉/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBe('🎉');
  await expect(page.getByRole('tab', { name: /🎉/ })).toBeFocused();
  await expect(page.getByText('하트 사용자', { exact: true })).toHaveCount(0);
  await page.locator('a[href="/@e2e-party"]').click();
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe('/@e2e-party');
  await page.goBack();
  await expect(heading).toBeVisible();
  await expect(page.getByRole('tab', { name: /🎉/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('축하 사용자', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '뒤로 가기' }).click();
  await expect(page).toHaveURL(/\/home$/);
  const originalControl = page.locator(`[id="${originalControlId}"]`);
  if (await originalControl.count()) {
    await expect(originalControl).toBeFocused();
  } else {
    await expect(page.getByTestId('universal-shell-root')).toBeFocused();
  }
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(previousScroll, 0);
});

test('guest 직접 진입은 순수 Repost 원문과 Type을 정규화하고 Back으로 원문을 연다', async ({
  page,
}) => {
  const author = await createE2EProfile({ handle: 'e2e-people-author' });
  const reactor = await createE2EProfile({
    handle: 'e2e-people-reactor',
    displayName: '반응 사용자',
  });
  const post = await createE2EPost({ body: 'People 직접 진입 원문', profileId: author.id });
  const repost = await createE2EPost({
    content: false,
    profileId: reactor.id,
    repostSourceId: post.id,
  });
  await db.insert(Reactions).values({ postId: post.id, profileId: reactor.id, type: '❤️' });
  await page.goto(`/wrong-handle/${toGlobalId('Post', repost.id)}/reactions?type=invalid`);

  const sourcePath = `/@${author.handle}/${toGlobalId('Post', post.id)}`;
  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(`${sourcePath}/reactions`);
  await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBe('❤️');
  await expect(page.getByRole('heading', { name: '반응한 사람', exact: true })).toBeVisible();
  await expect(page.getByText('반응 사용자', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '뒤로 가기' }).click();
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(sourcePath);
  await expect(page.getByText('People 직접 진입 원문', { exact: true })).toBeVisible();
});

test('Wide Viewer에서 People로 이동하면 Viewer를 닫고 새 화면으로 포커스를 옮긴다', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  const viewer = await createE2ESession({ handle: 'e2e-people-media' });
  const reactor = await createE2EProfile({ handle: 'e2e-media-reactor' });
  const imageUrl = 'https://example.com/e2e-reaction-people.png';
  await page.route(imageUrl, (route) =>
    route.fulfill({
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2V8AAAAASUVORK5CYII=',
        'base64',
      ),
      contentType: 'image/png',
    }),
  );
  const post = await createE2EPost({
    body: 'Viewer People 이동 대상',
    media: [{ altText: 'People 테스트 이미지', url: imageUrl }],
    profileId: viewer.profile!.id,
  });
  const reply = await createE2EPost({
    body: 'Viewer 답글 People 이동 대상',
    profileId: viewer.profile!.id,
    replyParentId: post.id,
  });
  await db.insert(Reactions).values([
    { postId: post.id, profileId: reactor.id, type: '❤️' },
    { postId: reply.id, profileId: reactor.id, type: '❤️' },
  ]);
  await setE2ESessionCookie(context, viewer.token);
  const postPath = `/@${viewer.profile!.handle}/${toGlobalId('Post', post.id)}`;
  await page.goto(postPath);
  await page.getByRole('button', { name: 'People 테스트 이미지 크게 보기' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator(`a[href="${postPath}/reactions"]`).click();

  const heading = page.getByRole('heading', { name: '반응한 사람', exact: true });
  await expect(heading).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(heading).toBeFocused();
  await expect(page.getByRole('link', { name: '개인정보 처리방침' })).toBeVisible();
  await page.setViewportSize({ height: 900, width: 1024 });
  await expect(heading).toBeVisible();
  await expect(page.getByRole('link', { name: '개인정보 처리방침' })).toHaveCount(0);
  await page.getByRole('button', { name: '뒤로 가기' }).click();
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(postPath);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.getByRole('button', { name: 'People 테스트 이미지 크게 보기' }).click();
  const replyPath = `/@${viewer.profile!.handle}/${toGlobalId('Post', reply.id)}`;
  await dialog.locator(`a[href="${replyPath}/reactions"]`).click();
  await expect(heading).toBeFocused();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '뒤로 가기' }).click();
  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(postPath);
});
