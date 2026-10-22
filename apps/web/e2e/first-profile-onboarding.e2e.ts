import { AccountProfiles, db, Profiles } from '@kosmo/core/db';
import { eq } from 'drizzle-orm';
import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

const steps = ['handle', 'details', 'tags', 'posting', 'review'] as const;
test.beforeEach(resetE2EDatabase);

async function ownedProfiles(accountId: string) {
  return db
    .select({
      id: Profiles.id,
      handle: Profiles.handle,
      displayName: Profiles.displayName,
      bio: Profiles.bio,
      defaultPostVisibility: Profiles.defaultPostVisibility,
      followPolicy: Profiles.followPolicy,
    })
    .from(Profiles)
    .innerJoin(AccountProfiles, eq(AccountProfiles.profileId, Profiles.id))
    .where(eq(AccountProfiles.accountId, accountId));
}
async function expectCompleted(page: Page) {
  await expect(page.getByRole('heading', { name: /첫 프로필이\s*준비됐어요/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible();
}

for (const origin of steps) {
  test(`${origin}에서 완료한 뒤 같은 Profile로 돌아가 수정한다`, async ({ context, page }) => {
    const session = await createE2ESession({ profile: false });
    await setE2ESessionCookie(context, session.token);
    await page.setViewportSize({ width: 390, height: 844 });
    const operationNames: string[] = [];
    page.on('request', (request) => {
      const operation = readGraphQLOperation(request.postData());
      if (operation?.operationName) {
        operationNames.push(operation.operationName);
      }
    });
    await page.goto('/home');
    await expect(page).toHaveURL(/\/first-profile\/handle$/);
    await page.getByRole('textbox', { name: '핸들', exact: true }).fill(`first_${origin}`);
    for (let index = 0; index < steps.indexOf(origin); index += 1) {
      await page.getByRole('button', { name: '다음', exact: true }).click();
      if (steps[index + 1] === 'details') {
        await page.getByRole('textbox', { name: '표시 이름' }).fill('첫 프로필');
        await page.getByRole('textbox', { name: '소개' }).fill('보존할 소개');
      }
      if (steps[index + 1] === 'tags') {
        await page.getByRole('textbox', { name: '프로필 태그', exact: true }).fill('책');
        await page.getByRole('button', { name: '추가', exact: true }).click();
        await expect(page.getByText('#책', { exact: true })).toBeVisible();
      }
      if (steps[index + 1] === 'posting') {
        await page.getByRole('radio', { name: /팔로워만:/ }).click();
        await page.getByRole('switch', { name: '팔로우 요청 자동 승인' }).click();
      }
    }
    await page
      .getByRole('button', {
        name: origin === 'review' ? '프로필 만들기' : '바로 시작',
        exact: true,
      })
      .click();
    await expectCompleted(page);
    const initial = await ownedProfiles(session.account.id);
    expect(initial).toHaveLength(1);
    expect(initial[0]!.handle).toBe(`first_${origin}`);
    expect(initial[0]!.defaultPostVisibility).toBe(
      steps.indexOf(origin) >= 3 ? 'FOLLOWERS' : 'UNLISTED',
    );
    expect(initial[0]!.followPolicy).toBe(
      steps.indexOf(origin) >= 3 ? 'APPROVAL_REQUIRED' : 'OPEN',
    );

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/first-profile/${origin}$`));
    let index = steps.indexOf(origin);
    if (origin === 'handle') {
      await expect(page.getByRole('textbox', { name: '핸들', exact: true })).toHaveAttribute(
        'readonly',
      );
      await page.getByRole('button', { name: '다음', exact: true }).click();
    } else {
      while (index > 1) {
        await page.getByRole('button', { name: '이전 화면' }).click();
        index -= 1;
        await expect(page).toHaveURL(new RegExp(`/first-profile/${steps[index]}$`));
      }
      await expect(page.getByRole('textbox', { name: '소개' })).toHaveValue('보존할 소개');
    }
    await page.getByRole('textbox', { name: '표시 이름' }).fill('수정한 이름');
    await page.getByRole('button', { name: '바로 시작' }).click();
    await expectCompleted(page);
    const edited = await ownedProfiles(session.account.id);
    expect(edited).toHaveLength(1);
    expect(edited[0]!.id).toBe(initial[0]!.id);
    expect(edited[0]!.displayName).toBe('수정한 이름');
    expect(
      operationNames.filter((name) => name === 'FirstProfileOnboardingCreateMutation'),
    ).toHaveLength(1);
    const saveCount = operationNames.filter(
      (name) => name === 'FirstProfileOnboardingSaveMutation',
    ).length;
    await page.goBack();
    await page.getByRole('button', { name: '바로 시작' }).click();
    await expectCompleted(page);
    expect(
      operationNames.filter((name) => name === 'FirstProfileOnboardingSaveMutation'),
    ).toHaveLength(saveCount);
    expect(await ownedProfiles(session.account.id)).toHaveLength(1);
  });
}

test('생성 후 저장 실패는 Profile과 입력을 보존하고 같은 Profile로 재시도한다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, session.token);
  await page.goto('/first-profile/handle');
  await page.getByRole('textbox', { name: '핸들', exact: true }).fill('first_retry');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('textbox', { name: '표시 이름' }).fill('재시도할 이름');
  let fail = true;
  await page.route('**/graphql', async (route) => {
    if (
      fail &&
      readGraphQLOperation(route.request().postData())?.operationName ===
        'FirstProfileOnboardingSaveMutation'
    ) {
      fail = false;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: null, errors: [{ message: 'save unavailable' }] }),
      });
    } else {
      await route.fallback();
    }
  });
  await page.getByRole('button', { name: '바로 시작' }).click();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  const before = await ownedProfiles(session.account.id);
  expect(before).toHaveLength(1);
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expectCompleted(page);
  const after = await ownedProfiles(session.account.id);
  expect(after).toHaveLength(1);
  expect(after[0]!.id).toBe(before[0]!.id);
  expect(after[0]!.displayName).toBe('재시도할 이름');
});

test('Profile이 없는 인증 사용자도 공개 프로필을 읽고 첫 프로필 만들기로 진입한다', async ({
  context,
  page,
}) => {
  const author = await createE2ESession({
    handle: 'public_author',
    displayName: '공개 프로필 작성자',
  });
  const visitor = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, visitor.token);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/@${author.profile!.handle}`);
  await expect(page.getByText('공개 프로필 작성자', { exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/@public_author$/);
  await page.getByRole('button', { name: '프로필 목록' }).first().click();
  await page.getByRole('link', { name: '첫 프로필 만들기' }).click();
  await expect(page).toHaveURL(/\/first-profile\/handle$/);
  expect(await ownedProfiles(visitor.account.id)).toHaveLength(0);
});
