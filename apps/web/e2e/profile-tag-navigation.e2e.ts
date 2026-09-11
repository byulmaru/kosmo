import {
  createE2EHashtagRelation,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('공개 Profile Tag link는 keyboard로 exact Hashtag 관련 Profile과 기존 Profile route를 연다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({
    displayName: '태그 진입 프로필',
    handle: 'prod529-entry',
  });
  expect(session.profile).not.toBeNull();
  const relatedA = await createE2EProfile({
    displayName: '별빛 여행자',
    handle: 'prod529-related-a',
  });
  const relatedB = await createE2EProfile({
    displayName: '은하 기록자',
    handle: 'prod529-related-b',
  });
  await createE2EProfile({
    displayName: '관계 없는 프로필',
    handle: 'prod529-unrelated',
  });
  await createE2EHashtagRelation({
    displayName: 'Fediverse',
    name: 'fediverse',
    profileIds: [session.profile!.id, relatedA.id, relatedB.id],
  });
  await setE2ESessionCookie(context, session.token);

  await page.goto('/@prod529-entry');
  const tagLink = page.getByRole('link', {
    exact: true,
    name: '#Fediverse 관련 프로필 보기',
  });
  await expect(tagLink).toHaveAttribute('href', /\/hashtags\/[^/]+\/profiles$/);

  for (
    let index = 0;
    index < 20 && !(await tagLink.evaluate((node) => node === document.activeElement));
    index += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(tagLink).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/hashtags\/[^/]+\/profiles$/);
  await expect(page.getByRole('heading', { name: '#Fediverse 관련 프로필' })).toBeVisible();
  await expect(
    page.locator('a[href="/@prod529-entry"]').filter({ hasText: '태그 진입 프로필' }),
  ).toBeVisible();
  await expect(
    page.locator('a[href="/@prod529-related-a"]').filter({ hasText: '별빛 여행자' }),
  ).toBeVisible();
  await expect(
    page.locator('a[href="/@prod529-related-b"]').filter({ hasText: '은하 기록자' }),
  ).toBeVisible();
  await expect(page.locator('a[href="/@prod529-unrelated"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '팔로우' })).toHaveCount(2);

  const relatedProfileLink = page.locator('a[href="/@prod529-related-a"]');
  await expect(relatedProfileLink).toBeVisible();
  await relatedProfileLink.click();
  await expect(page).toHaveURL(/\/@prod529-related-a$/);
  await expect(page.getByRole('heading', { name: '별빛 여행자' })).toBeVisible();
});
