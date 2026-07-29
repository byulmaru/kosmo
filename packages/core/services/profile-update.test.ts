import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Hashtags,
  Instances,
  pg,
  ProfileHashtags,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { updateProfile } from './profile-update';

after(async () => pg.end());

const createProfileFixture = async ({
  instanceKind = InstanceKind.LOCAL,
  profileState = ProfileState.ACTIVE,
  accountState = AccountState.ACTIVE,
  role = AccountProfileRole.OWNER,
}: {
  instanceKind?: InstanceKind;
  profileState?: ProfileState;
  accountState?: AccountState;
  role?: AccountProfileRole;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: profileState,
    })
    .returning()
    .then(firstOrThrow);
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: accountState })
    .returning()
    .then(firstOrThrow);
  await db.insert(AccountProfiles).values({ accountId: account.id, profileId: profile.id, role });

  return { account, instance, profile };
};

const readTags = async (profileId: string) =>
  (
    await db
      .select({ name: Hashtags.name })
      .from(ProfileHashtags)
      .innerJoin(Hashtags, eq(Hashtags.id, ProfileHashtags.hashtagId))
      .where(eq(ProfileHashtags.profileId, profileId))
  )
    .map(({ name }) => name)
    .sort();

test('Owner는 scalar와 정규화된 tags를 하나의 update로 저장한다', async () => {
  const { account, profile } = await createProfileFixture();

  const updated = await updateProfile({
    accountId: account.id,
    profileId: profile.id,
    displayName: 'Updated',
    bio: 'Bio',
    tags: [' #Ｆｏｏ ', 'Straße', 'ı'],
  });

  assert.equal(updated.displayName, 'Updated');
  assert.equal(updated.bio, 'Bio');
  assert.deepEqual(await readTags(profile.id), ['foo', 'strasse', 'ı'].sort());
});

test('omitted와 null tags는 기존 관계를 유지하고 empty array는 관계만 제거한다', async () => {
  const { account, profile } = await createProfileFixture();
  await updateProfile({ accountId: account.id, profileId: profile.id, tags: ['one', 'two'] });

  await updateProfile({ accountId: account.id, profileId: profile.id, displayName: 'Changed' });
  assert.deepEqual(await readTags(profile.id), ['one', 'two']);
  await updateProfile({ accountId: account.id, profileId: profile.id, tags: null });
  assert.deepEqual(await readTags(profile.id), ['one', 'two']);

  await updateProfile({ accountId: account.id, profileId: profile.id, tags: [] });
  assert.deepEqual(await readTags(profile.id), []);
  assert.equal(
    await db
      .select()
      .from(Hashtags)
      .where(eq(Hashtags.name, 'one'))
      .then((rows) => rows.length),
    1,
  );
});

test('validation 실패는 scalar와 기존 tags를 함께 보존한다', async () => {
  const { account, profile } = await createProfileFixture();
  await updateProfile({
    accountId: account.id,
    profileId: profile.id,
    displayName: 'Before',
    tags: ['before'],
  });

  await assert.rejects(
    updateProfile({
      accountId: account.id,
      profileId: profile.id,
      displayName: 'Should not commit',
      tags: ['valid', 'valid'],
    }),
    ValidationError,
  );
  const persisted = await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, profile.id))
    .then(firstOrThrow);
  assert.equal(persisted.displayName, 'Before');
  assert.deepEqual(await readTags(profile.id), ['before']);
});

test('Deactivated Local Profile은 Owner라도 수정할 수 없고 tags를 보존한다', async () => {
  const deactivated = await createProfileFixture({ profileState: ProfileState.DISABLED });
  const retainedHashtag = await db
    .insert(Hashtags)
    .values({ name: `retained_${crypto.randomUUID().replaceAll('-', '_')}` })
    .returning()
    .then(firstOrThrow);
  await db
    .insert(ProfileHashtags)
    .values({ hashtagId: retainedHashtag.id, profileId: deactivated.profile.id });

  await assert.rejects(
    updateProfile({
      accountId: deactivated.account.id,
      profileId: deactivated.profile.id,
      displayName: 'Changed while deactivated',
      tags: ['replacement'],
    }),
    NotFoundError,
  );

  const persisted = await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, deactivated.profile.id))
    .then(firstOrThrow);
  assert.equal(persisted.displayName, deactivated.profile.displayName);
  assert.deepEqual(await readTags(deactivated.profile.id), [retainedHashtag.name]);
});

test('Member와 inactive Account는 거부되고 관계없는 Account와 Remote/Suspended Profile은 조회 경계를 따른다', async () => {
  const owner = await createProfileFixture();
  const member = await createProfileFixture({ role: AccountProfileRole.MEMBER });
  const unrelated = await createProfileFixture();
  const remote = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const suspended = await createProfileFixture({ profileState: ProfileState.SUSPENDED });
  const inactiveAccount = await createProfileFixture({ accountState: AccountState.DISABLED });
  const retainedHashtag = await db
    .insert(Hashtags)
    .values({ name: `retained_${crypto.randomUUID().replaceAll('-', '_')}` })
    .returning()
    .then(firstOrThrow);
  await db
    .insert(ProfileHashtags)
    .values({ hashtagId: retainedHashtag.id, profileId: suspended.profile.id });

  await assert.rejects(
    updateProfile({ accountId: member.account.id, profileId: member.profile.id, tags: ['member'] }),
    PermissionDeniedError,
  );
  await assert.rejects(
    updateProfile({
      accountId: unrelated.account.id,
      profileId: owner.profile.id,
      tags: ['other'],
    }),
    NotFoundError,
  );
  await assert.rejects(
    updateProfile({ accountId: remote.account.id, profileId: remote.profile.id, tags: ['remote'] }),
    NotFoundError,
  );
  await assert.rejects(
    updateProfile({
      accountId: suspended.account.id,
      profileId: suspended.profile.id,
      tags: ['suspended'],
    }),
    NotFoundError,
  );
  assert.deepEqual(await readTags(suspended.profile.id), [retainedHashtag.name]);
  await assert.rejects(
    updateProfile({
      accountId: inactiveAccount.account.id,
      profileId: inactiveAccount.profile.id,
      tags: ['inactive_account'],
    }),
    NotFoundError,
  );
});

test('호출 transaction이 rollback되면 scalar와 relation이 모두 복구된다', async () => {
  const { account, profile } = await createProfileFixture();
  await updateProfile({ accountId: account.id, profileId: profile.id, tags: ['before'] });

  await assert.rejects(
    db.transaction(async (tx) => {
      await updateProfile(
        { accountId: account.id, profileId: profile.id, displayName: 'Rollback', tags: ['after'] },
        tx,
      );
      throw new Error('rollback');
    }),
    /rollback/,
  );
  const persisted = await db
    .select()
    .from(Profiles)
    .where(eq(Profiles.id, profile.id))
    .then(firstOrThrow);
  assert.equal(persisted.displayName, profile.displayName);
  assert.deepEqual(await readTags(profile.id), ['before']);
});

test('동시 replacement는 중간 목록 없이 한 요청의 전체 목록으로 끝난다', async () => {
  const { account, profile } = await createProfileFixture();
  const first = ['shared', 'first_two'];
  const second = ['shared', 'second_two', 'second_three'];

  await Promise.all([
    updateProfile({ accountId: account.id, profileId: profile.id, tags: first }),
    updateProfile({ accountId: account.id, profileId: profile.id, tags: second }),
  ]);

  const names = await readTags(profile.id);
  assert.ok(
    names.join(',') === first.sort().join(',') || names.join(',') === second.sort().join(','),
    `unexpected concurrent result: ${names.join(',')}`,
  );
});

test('서로 다른 Profile의 같은 tags 역순 동시 update가 모두 성공한다', async () => {
  const first = await createProfileFixture();
  const second = await createProfileFixture();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const firstTag = `tag_${suffix}a`;
  const secondTag = `tag_${suffix}b`;

  assert.deepEqual(
    await db
      .select({ name: Hashtags.name })
      .from(Hashtags)
      .where(inArray(Hashtags.name, [firstTag, secondTag])),
    [],
  );

  await Promise.all([
    updateProfile({
      accountId: first.account.id,
      profileId: first.profile.id,
      tags: [firstTag, secondTag],
    }),
    updateProfile({
      accountId: second.account.id,
      profileId: second.profile.id,
      tags: [secondTag, firstTag],
    }),
  ]);

  assert.deepEqual(await readTags(first.profile.id), [firstTag, secondTag].sort());
  assert.deepEqual(await readTags(second.profile.id), [firstTag, secondTag].sort());
});

test('동시 partial scalar update는 서로 다른 필드를 모두 보존한다', async () => {
  const { account, profile } = await createProfileFixture();

  await Promise.all([
    updateProfile({ accountId: account.id, profileId: profile.id, displayName: 'Display name' }),
    updateProfile({ accountId: account.id, profileId: profile.id, bio: 'Bio' }),
  ]);

  const persisted = await db
    .select({ displayName: Profiles.displayName, bio: Profiles.bio })
    .from(Profiles)
    .where(eq(Profiles.id, profile.id))
    .then(firstOrThrow);
  assert.deepEqual(persisted, { displayName: 'Display name', bio: 'Bio' });
});
