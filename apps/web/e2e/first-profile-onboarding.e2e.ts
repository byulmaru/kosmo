import { AccountProfiles, db, ProfileHashtags, Profiles } from '@kosmo/core/db';
import { eq } from 'drizzle-orm';
import { createE2ESession, resetE2EDatabase, setE2ESessionCookie } from './db-fixtures';
import { expect, test } from './fixtures';
import { readGraphQLOperation } from './graphql';
import type { Page } from '@playwright/test';

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
  await expect(page).toHaveURL(/\/home$/);
}
async function expectNewComposerVisibility(page: Page, label: '공개' | '조용한 공개' | '팔로워만') {
  const expand = page.getByRole('button', { name: 'Composer 확장' });
  const open = page.getByRole('button', { name: '글쓰기', exact: true });
  await expect(expand.or(open)).toBeVisible();
  if (await expand.isVisible()) {
    await expand.click();
  } else {
    await open.click();
  }
  await expect(
    page
      .getByRole('form', { name: /^게시글 작성 \(@/ })
      .getByRole('button', { name: `공개 범위: ${label}`, exact: true }),
  ).toBeVisible();
}
function trackMutations(page: Page) {
  const mutations: string[] = [];
  page.on('request', (request) => {
    const name = readGraphQLOperation(request.postData())?.operationName;
    if (name?.startsWith('FirstProfileOnboarding') && name.endsWith('Mutation')) {
      mutations.push(name);
    }
  });
  return mutations;
}

test('핸들의 다음에서 생성하고 각 단계의 다음에서 같은 Profile을 저장한다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, session.token);
  await page.setViewportSize({ width: 390, height: 844 });
  const mutations = trackMutations(page);
  await page.goto('/home');
  await expect(page).toHaveURL(/\/first-profile\/handle$/);
  await page.getByRole('textbox', { name: '핸들', exact: true }).fill('first_steps');
  expect(await ownedProfiles(session.account.id)).toHaveLength(0);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/details$/);
  const created = await ownedProfiles(session.account.id);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({
    handle: 'first_steps',
    displayName: 'first_steps',
    bio: null,
    defaultPostVisibility: 'PUBLIC',
    followPolicy: 'OPEN',
  });

  await page.getByRole('textbox', { name: '표시 이름' }).fill('저장한 이름');
  await page.getByRole('textbox', { name: '소개' }).fill('저장한 소개');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/tags$/);
  expect((await ownedProfiles(session.account.id))[0]).toMatchObject({
    id: created[0]!.id,
    displayName: '저장한 이름',
    bio: '저장한 소개',
  });
  await page.getByRole('textbox', { name: '프로필 태그', exact: true }).fill('책');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await page.getByRole('button', { name: '지금은 건너뛰기' }).click();
  await page.getByRole('radio', { name: /팔로워만:/ }).click();
  await page.getByRole('switch', { name: '팔로우 요청 자동 승인' }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/review$/);
  expect((await ownedProfiles(session.account.id))[0]).toMatchObject({
    id: created[0]!.id,
    defaultPostVisibility: 'FOLLOWERS',
    followPolicy: 'APPROVAL_REQUIRED',
  });
  await expect(page.getByText('#책', { exact: true })).not.toBeVisible();
  expect(
    await db
      .select({ hashtagId: ProfileHashtags.hashtagId })
      .from(ProfileHashtags)
      .where(eq(ProfileHashtags.profileId, created[0]!.id)),
  ).toHaveLength(0);
  const savedMutations = [...mutations];
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expectCompleted(page);
  expect(mutations).toEqual(savedMutations);
  expect(mutations.filter((name) => name === 'FirstProfileOnboardingCreateMutation')).toHaveLength(
    1,
  );
  expect(mutations.filter((name) => name === 'FirstProfileOnboardingSelectMutation')).toHaveLength(
    1,
  );

  const completed = await ownedProfiles(session.account.id);
  expect(completed).toHaveLength(1);
  expect(completed[0]).toMatchObject({ id: created[0]!.id, displayName: '저장한 이름' });
  await expectNewComposerVisibility(page, '팔로워만');
});

test('첫 화면의 바로 시작은 기본값으로 생성하고 나머지 단계를 생략한다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, session.token);
  await page.setViewportSize({ width: 390, height: 844 });
  const mutations = trackMutations(page);
  await page.goto('/first-profile/handle');
  await expect(page.getByRole('button', { name: '바로 시작', exact: true })).toBeDisabled();
  for (const invalid of ['ab', 'bad-handle', '한글핸들', 'a'.repeat(31)]) {
    await page.getByRole('textbox', { name: '핸들', exact: true }).fill(invalid);
    await expect(page.getByRole('button', { name: '바로 시작', exact: true })).toBeDisabled();
  }
  expect(mutations).toEqual([]);
  await page.getByRole('textbox', { name: '핸들', exact: true }).fill('first_quick');
  await expect(page.getByRole('button', { name: '바로 시작', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '바로 시작' }).click();
  await expectCompleted(page);
  expect(await ownedProfiles(session.account.id)).toMatchObject([
    {
      handle: 'first_quick',
      displayName: 'first_quick',
      defaultPostVisibility: 'PUBLIC',
      followPolicy: 'OPEN',
    },
  ]);
  expect(mutations).toEqual([
    'FirstProfileOnboardingCreateMutation',
    'FirstProfileOnboardingSelectMutation',
  ]);
  await expectNewComposerVisibility(page, '공개');
});

for (const scenario of [
  { id: 'default', action: '다음', changeToUnlisted: false, expected: 'PUBLIC' },
  { id: 'skip', action: '지금은 건너뛰기', changeToUnlisted: true, expected: 'PUBLIC' },
  { id: 'immediate', action: '바로 시작', changeToUnlisted: true, expected: 'PUBLIC' },
  { id: 'unlisted', action: '다음', changeToUnlisted: true, expected: 'UNLISTED' },
] as const) {
  test(`게시 설정 ${scenario.id} 결과를 저장값과 새 글쓰기에 반영한다`, async ({
    context,
    page,
  }) => {
    const session = await createE2ESession({ profile: false });
    await setE2ESessionCookie(context, session.token);
    await page.setViewportSize({ width: 390, height: 844 });
    const mutations = trackMutations(page);
    await page.goto('/first-profile/handle');
    await page.getByRole('textbox', { name: '핸들', exact: true }).fill(`public_${scenario.id}`);
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page).toHaveURL(/\/first-profile\/details$/);
    await page.getByRole('button', { name: '지금은 건너뛰기' }).click();
    await expect(page).toHaveURL(/\/first-profile\/tags$/);
    await page.getByRole('button', { name: '지금은 건너뛰기' }).click();
    await expect(page).toHaveURL(/\/first-profile\/posting$/);
    await expect(page.getByRole('radio', { name: /^전체 공개:/ })).toBeChecked();
    if (scenario.changeToUnlisted) {
      await page.getByRole('radio', { name: /^조용한 공개:/ }).click();
    }
    await page.getByRole('button', { name: scenario.action, exact: true }).click();
    if (scenario.action !== '바로 시작') {
      await expect(page).toHaveURL(/\/first-profile\/review$/);
      await page.getByRole('button', { name: '다음', exact: true }).click();
    }
    await expectCompleted(page);
    expect(await ownedProfiles(session.account.id)).toMatchObject([
      { defaultPostVisibility: scenario.expected, followPolicy: 'OPEN' },
    ]);
    expect(mutations.filter((name) => name === 'FirstProfileOnboardingSaveMutation')).toHaveLength(
      scenario.action === '다음' ? 1 : 0,
    );
    await expectNewComposerVisibility(
      page,
      scenario.expected === 'PUBLIC' ? '공개' : '조용한 공개',
    );
  });
}

test('선택 단계의 저장 실패 후에도 같은 Profile로 건너뛰고 완료할 수 있다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, session.token);
  const mutations = trackMutations(page);
  await page.goto('/first-profile/handle');
  await page.getByRole('textbox', { name: '핸들', exact: true }).fill('first_skip');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/details$/);
  const created = await ownedProfiles(session.account.id);
  await page.getByRole('textbox', { name: '표시 이름' }).fill('저장되지 않은 이름');
  await page.route('**/graphql', async (route) => {
    if (
      readGraphQLOperation(route.request().postData())?.operationName ===
      'FirstProfileOnboardingSaveMutation'
    ) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: null, errors: [{ message: 'save unavailable' }] }),
      });
    } else {
      await route.fallback();
    }
  });
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('button', { name: '지금은 건너뛰기' })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: '표시 이름' })).toHaveValue('저장되지 않은 이름');
  await expect(page).toHaveURL(/\/first-profile\/details$/);
  await page.getByRole('button', { name: '지금은 건너뛰기' }).click();
  await expect(page).toHaveURL(/\/first-profile\/tags$/);
  await page.getByRole('button', { name: '바로 시작' }).click();
  await expectCompleted(page);
  await expect(page.getByText('저장되지 않은 이름', { exact: true })).toHaveCount(0);
  expect(await ownedProfiles(session.account.id)).toEqual(created);
  expect(mutations.filter((name) => name === 'FirstProfileOnboardingSaveMutation')).toHaveLength(1);
  expect(mutations.filter((name) => name === 'FirstProfileOnboardingCreateMutation')).toHaveLength(
    1,
  );
});

test('생성 실패는 핸들 입력을 유지하고 다음을 다시 시도할 수 있다', async ({ context, page }) => {
  const session = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, session.token);
  let fail = true;
  await page.route('**/graphql', async (route) => {
    if (
      fail &&
      readGraphQLOperation(route.request().postData())?.operationName ===
        'FirstProfileOnboardingCreateMutation'
    ) {
      fail = false;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: null, errors: [{ message: 'create unavailable' }] }),
      });
    } else {
      await route.fallback();
    }
  });
  await page.goto('/first-profile/handle');
  await page.getByRole('textbox', { name: '핸들', exact: true }).fill('first_retry');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/first-profile\/handle$/);
  await expect(page.getByRole('textbox', { name: '핸들', exact: true })).toHaveValue('first_retry');
  expect(await ownedProfiles(session.account.id)).toHaveLength(0);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/details$/);
  expect(await ownedProfiles(session.account.id)).toHaveLength(1);
});

test('생성 후 흐름을 나갔다가 다시 진입하면 기존 Profile로 홈에 돌아간다', async ({
  context,
  page,
}) => {
  const session = await createE2ESession({ profile: false });
  await setE2ESessionCookie(context, session.token);
  const mutations = trackMutations(page);
  await page.goto('/first-profile/handle');
  await page.getByRole('textbox', { name: '핸들', exact: true }).fill('first_reentry');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page).toHaveURL(/\/first-profile\/details$/);
  const created = await ownedProfiles(session.account.id);
  await page.getByRole('button', { name: '바로 시작' }).click();
  await expectCompleted(page);
  await expect(page).toHaveURL(/\/home$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  for (const step of ['handle', 'details', 'complete']) {
    await page.goto(`/first-profile/${step}`);
    await expect(page).toHaveURL(/\/home$/);
  }
  expect(await ownedProfiles(session.account.id)).toEqual(created);
  expect(mutations.filter((name) => name === 'FirstProfileOnboardingCreateMutation')).toHaveLength(
    1,
  );
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
