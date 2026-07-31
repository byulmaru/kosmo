import assert from 'node:assert/strict';
import { after, afterEach, mock, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  ActivityPubActors,
  db,
  firstOrThrow,
  Hashtags,
  Instances,
  Media,
  pg,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileHashtags,
  ProfileMedia,
  Profiles,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  ProfileFollowPolicy,
  ProfileMediaKind,
  ProfileState,
} from '../enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { updateProfile } from './profile-update';

after(async () => pg.end());

afterEach(() => {
  mock.restoreAll();
});

const createProfileFixture = async ({
  instanceKind = InstanceKind.LOCAL,
  profileState = ProfileState.ACTIVE,
  accountState = AccountState.ACTIVE,
  canonicalOrigin,
  role = AccountProfileRole.OWNER,
}: {
  instanceKind?: InstanceKind;
  profileState?: ProfileState;
  accountState?: AccountState;
  canonicalOrigin?: string;
  role?: AccountProfileRole;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin,
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

const readHashtag = async (name: string) =>
  db.select().from(Hashtags).where(eq(Hashtags.name, name)).then(firstOrThrow);

const createMedia = ({
  accountId,
  profileId,
  source = MediaSource.LOCAL,
  state = MediaState.READY,
}: {
  accountId: string;
  profileId: string;
  source?: MediaSource;
  state?: MediaState;
}) =>
  db
    .insert(Media)
    .values({
      accountId: source === MediaSource.LOCAL ? accountId : null,
      mediaType: state === MediaState.READY ? 'image/webp' : null,
      profileId,
      readyAt:
        source === MediaSource.LOCAL && state === MediaState.READY ? Temporal.Now.instant() : null,
      source,
      state,
      storageReference: source === MediaSource.LOCAL ? `u_${crypto.randomUUID()}` : null,
      uploadExpiresAt:
        source === MediaSource.LOCAL ? Temporal.Now.instant().add({ minutes: 5 }) : null,
      url: state === MediaState.READY ? `https://media.example/${crypto.randomUUID()}.webp` : null,
    })
    .returning()
    .then(firstOrThrow);

const readProfileMedia = (profileId: string) =>
  db
    .select({ kind: ProfileMedia.kind, mediaId: ProfileMedia.mediaId })
    .from(ProfileMedia)
    .where(eq(ProfileMedia.profileId, profileId))
    .then((rows) => rows.toSorted((a, b) => a.kind.localeCompare(b.kind)));

const createRemoteFollower = async (followeeProfileId: string) => {
  const remote = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const actorUri = `https://${remote.instance.domain}/users/${remote.profile.id}`;
  await db.insert(ActivityPubActors).values({
    inboxUri: `${actorUri}/inbox`,
    profileId: remote.profile.id,
    sharedInboxUri: `https://${remote.instance.domain}/inbox`,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });
  await db.insert(ProfileFollows).values({
    followeeProfileId,
    followerProfileId: remote.profile.id,
  });
};

test('Profile Media 관계는 kind별 하나만 허용하고 관계 삭제 시 Media를 보존한다', async () => {
  const { account, profile } = await createProfileFixture();
  const media = await createMedia({ accountId: account.id, profileId: profile.id });
  const otherMedia = await createMedia({ accountId: account.id, profileId: profile.id });

  await db.insert(ProfileMedia).values([
    { kind: ProfileMediaKind.AVATAR, mediaId: media.id, profileId: profile.id },
    { kind: ProfileMediaKind.HEADER, mediaId: media.id, profileId: profile.id },
  ]);

  await assert.rejects(
    db.insert(ProfileMedia).values({
      kind: ProfileMediaKind.AVATAR,
      mediaId: otherMedia.id,
      profileId: profile.id,
    }),
  );

  await db
    .delete(ProfileMedia)
    .where(
      and(eq(ProfileMedia.profileId, profile.id), eq(ProfileMedia.kind, ProfileMediaKind.AVATAR)),
    );

  assert.equal(
    await db
      .select()
      .from(Media)
      .where(inArray(Media.id, [media.id, otherMedia.id]))
      .then((rows) => rows.length),
    2,
  );
});

test('avatar/header 입력은 교체·제거·생략을 kind별로 적용하고 Media를 보존한다', async () => {
  const { account, profile } = await createProfileFixture();
  const originalAvatar = await createMedia({ accountId: account.id, profileId: profile.id });
  const originalHeader = await createMedia({ accountId: account.id, profileId: profile.id });
  const replacementAvatar = await createMedia({ accountId: account.id, profileId: profile.id });
  await db.insert(ProfileMedia).values([
    {
      kind: ProfileMediaKind.AVATAR,
      mediaId: originalAvatar.id,
      profileId: profile.id,
    },
    {
      kind: ProfileMediaKind.HEADER,
      mediaId: originalHeader.id,
      profileId: profile.id,
    },
  ]);

  await updateProfile({
    accountId: account.id,
    avatarMediaId: replacementAvatar.id,
    headerMediaId: null,
    profileId: profile.id,
  });
  assert.deepEqual(await readProfileMedia(profile.id), [
    { kind: ProfileMediaKind.AVATAR, mediaId: replacementAvatar.id },
  ]);

  await updateProfile({ accountId: account.id, bio: 'omitted media', profileId: profile.id });
  assert.deepEqual(await readProfileMedia(profile.id), [
    { kind: ProfileMediaKind.AVATAR, mediaId: replacementAvatar.id },
  ]);
  assert.equal(
    await db
      .select()
      .from(Media)
      .where(inArray(Media.id, [originalAvatar.id, originalHeader.id, replacementAvatar.id]))
      .then((rows) => rows.length),
    3,
  );
});

test('사용할 수 없는 avatar/header Media 하나는 scalar·policy·관계를 모두 보존한다', async () => {
  const target = await createProfileFixture();
  const other = await createProfileFixture();
  const currentAvatar = await createMedia({
    accountId: target.account.id,
    profileId: target.profile.id,
  });
  const validAvatar = await createMedia({
    accountId: target.account.id,
    profileId: target.profile.id,
  });
  const wrongProfile = await createMedia({
    accountId: other.account.id,
    profileId: other.profile.id,
  });
  const remote = await createMedia({
    accountId: target.account.id,
    profileId: target.profile.id,
    source: MediaSource.REMOTE,
  });
  const uploading = await createMedia({
    accountId: target.account.id,
    profileId: target.profile.id,
    state: MediaState.UPLOADING,
  });
  await db.insert(ProfileMedia).values({
    kind: ProfileMediaKind.AVATAR,
    mediaId: currentAvatar.id,
    profileId: target.profile.id,
  });

  for (const invalidHeaderId of [wrongProfile.id, remote.id, uploading.id, crypto.randomUUID()]) {
    await assert.rejects(
      updateProfile({
        accountId: target.account.id,
        avatarMediaId: validAvatar.id,
        displayName: 'Should not commit',
        followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
        headerMediaId: invalidHeaderId,
        profileId: target.profile.id,
      }),
      (error) => error instanceof ValidationError && error.field === 'headerMediaId',
    );

    const persisted = await db
      .select()
      .from(Profiles)
      .where(eq(Profiles.id, target.profile.id))
      .then(firstOrThrow);
    assert.equal(persisted.displayName, target.profile.displayName);
    assert.equal(persisted.followPolicy, ProfileFollowPolicy.OPEN);
    assert.deepEqual(await readProfileMedia(target.profile.id), [
      { kind: ProfileMediaKind.AVATAR, mediaId: currentAvatar.id },
    ]);
  }
});

test('followPolicy만 변경해도 기존 Pending Follow Request를 유지한다', async () => {
  const target = await createProfileFixture();
  const follower = await createProfileFixture();
  const request = await db
    .insert(ProfileFollowRequests)
    .values({
      followeeProfileId: target.profile.id,
      followerProfileId: follower.profile.id,
    })
    .returning()
    .then(firstOrThrow);

  await updateProfile({
    accountId: target.account.id,
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    profileId: target.profile.id,
  });

  assert.deepEqual(
    await db.select().from(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, request.id)),
    [request],
  );
});

test('변경한 displayName은 Unicode code point 40자를 허용하고 41자를 거부한다', async () => {
  const { account, profile } = await createProfileFixture();
  const valid = '😀'.repeat(40);

  const updated = await updateProfile({
    accountId: account.id,
    displayName: `  ${valid}  `,
    profileId: profile.id,
  });
  assert.equal(updated.profile.displayName, valid);

  await assert.rejects(
    updateProfile({
      accountId: account.id,
      displayName: '😀'.repeat(41),
      profileId: profile.id,
    }),
    (error) => error instanceof ValidationError && error.field === 'displayName',
  );
  assert.equal(
    await db
      .select({ displayName: Profiles.displayName })
      .from(Profiles)
      .where(eq(Profiles.id, profile.id))
      .then(firstOrThrow)
      .then(({ displayName }) => displayName),
    valid,
  );
});

test('40 code point 초과 legacy displayName은 저장 원문과 같을 때만 허용한다', async () => {
  const { account, profile } = await createProfileFixture();
  const legacyDisplayName = '😀'.repeat(41);
  await db
    .update(Profiles)
    .set({ displayName: legacyDisplayName })
    .where(eq(Profiles.id, profile.id));

  const updated = await updateProfile({
    accountId: account.id,
    bio: 'legacy preserved',
    displayName: legacyDisplayName,
    profileId: profile.id,
  });
  assert.equal(updated.profile.displayName, legacyDisplayName);
  assert.equal(updated.profile.bio, 'legacy preserved');

  await assert.rejects(
    updateProfile({
      accountId: account.id,
      displayName: `${legacyDisplayName.slice(0, -2)}a`,
      profileId: profile.id,
    }),
    (error) => error instanceof ValidationError && error.field === 'displayName',
  );
});

test('bio는 trim 후 JavaScript UTF-16 길이 500자를 적용한다', async () => {
  const { account, profile } = await createProfileFixture();
  const valid = '😀'.repeat(250);

  const updated = await updateProfile({
    accountId: account.id,
    bio: `  ${valid}  `,
    profileId: profile.id,
  });
  assert.equal(updated.profile.bio, valid);

  await assert.rejects(
    updateProfile({
      accountId: account.id,
      bio: ` ${'😀'.repeat(251)} `,
      profileId: profile.id,
    }),
    (error) => error instanceof ValidationError && error.field === 'bio',
  );
  assert.equal(
    await db
      .select({ bio: Profiles.bio })
      .from(Profiles)
      .where(eq(Profiles.id, profile.id))
      .then(firstOrThrow)
      .then(({ bio }) => bio),
    valid,
  );
});

test('Owner는 scalar와 정규화된 tags를 하나의 update로 저장한다', async () => {
  const { account, profile } = await createProfileFixture();

  const updated = await updateProfile({
    accountId: account.id,
    profileId: profile.id,
    displayName: 'Updated',
    bio: 'Bio',
    tags: [' #Ｆｏｏ ', 'Straße', 'ı'],
  });

  assert.equal(updated.profile.displayName, 'Updated');
  assert.equal(updated.profile.bio, 'Bio');
  assert.deepEqual(await readTags(profile.id), ['foo', 'straße', 'ı'].sort());
  assert.equal((await readHashtag('foo')).displayName, 'Foo');
  assert.equal((await readHashtag('straße')).displayName, 'Straße');
});

test('같은 canonical Hashtag의 최초 display name을 유지한다', async () => {
  const first = await createProfileFixture();
  const second = await createProfileFixture();

  await updateProfile({
    accountId: first.account.id,
    profileId: first.profile.id,
    tags: ['#Kosmo'],
  });
  await updateProfile({
    accountId: second.account.id,
    profileId: second.profile.id,
    tags: ['KOSMO'],
  });

  assert.equal((await readHashtag('kosmo')).displayName, 'Kosmo');
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
    .values({
      name: `retained_${crypto.randomUUID().replaceAll('-', '_')}`,
      displayName: 'Retained',
    })
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
    .values({
      name: `retained_${crypto.randomUUID().replaceAll('-', '_')}`,
      displayName: 'Retained',
    })
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

test('실제 actor 표현 변경만 one-shot postCommit delivery lifecycle을 만든다', async () => {
  const fixture = await createProfileFixture({
    canonicalOrigin: `https://${crypto.randomUUID()}.local.example`,
  });
  const avatar = await createMedia({
    accountId: fixture.account.id,
    profileId: fixture.profile.id,
  });
  const header = await createMedia({
    accountId: fixture.account.id,
    profileId: fixture.profile.id,
  });
  await createRemoteFollower(fixture.profile.id);
  const delivery = mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 202 }),
  );

  const first = await updateProfile({
    accountId: fixture.account.id,
    displayName: 'Changed',
    profileId: fixture.profile.id,
  });
  const firstPostCommit = first.postCommit();
  assert.equal(first.postCommit(), firstPostCommit);
  await firstPostCommit;
  assert.equal(delivery.mock.callCount(), 1);

  for (const input of [
    { bio: 'Changed bio' },
    { followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED },
    { avatarMediaId: avatar.id },
    { headerMediaId: header.id },
    { avatarMediaId: null },
    { headerMediaId: null },
  ]) {
    const result = await updateProfile({
      accountId: fixture.account.id,
      profileId: fixture.profile.id,
      ...input,
    });
    await result.postCommit();
  }
  assert.equal(delivery.mock.callCount(), 7);

  const noOp = await updateProfile({
    accountId: fixture.account.id,
    avatarMediaId: null,
    bio: '  Changed bio  ',
    displayName: 'Changed',
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
    headerMediaId: null,
    profileId: fixture.profile.id,
    tags: ['tag_only'],
  });
  await noOp.postCommit();
  assert.equal(delivery.mock.callCount(), 7);
});

test('caller-owned transaction은 outer commit 뒤 실행할 postCommit lifecycle을 반환한다', async () => {
  const fixture = await createProfileFixture({
    canonicalOrigin: `https://${crypto.randomUUID()}.local.example`,
  });
  await createRemoteFollower(fixture.profile.id);
  const delivery = mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status: 202 }),
  );
  let result: Awaited<ReturnType<typeof updateProfile>> | undefined;

  await db.transaction(async (tx) => {
    result = await updateProfile(
      {
        accountId: fixture.account.id,
        displayName: 'Committed',
        profileId: fixture.profile.id,
      },
      tx,
    );
    assert.equal(delivery.mock.callCount(), 0);
  });

  assert.ok(result);
  await result.postCommit();
  assert.equal(delivery.mock.callCount(), 1);

  await assert.rejects(
    db.transaction(async (tx) => {
      await updateProfile(
        {
          accountId: fixture.account.id,
          displayName: 'Rolled back',
          profileId: fixture.profile.id,
        },
        tx,
      );
      throw new Error('rollback');
    }),
    /rollback/,
  );
  assert.equal(delivery.mock.callCount(), 1);
});

test('postCommit delivery 실패는 committed Profile 결과를 유지하고 관측한다', async () => {
  const fixture = await createProfileFixture({
    canonicalOrigin: `https://${crypto.randomUUID()}.local.example`,
  });
  await createRemoteFollower(fixture.profile.id);
  const delivery = mock.method(globalThis, 'fetch', async () => {
    throw new Error('delivery failed');
  });
  const errorLog = mock.method(console, 'error', () => undefined);

  const result = await updateProfile({
    accountId: fixture.account.id,
    bio: 'Committed despite delivery failure',
    profileId: fixture.profile.id,
  });
  await result.postCommit();

  assert.ok(delivery.mock.callCount() > 0);
  assert.equal(result.profile.bio, 'Committed despite delivery failure');
  assert.equal(
    await db
      .select({ bio: Profiles.bio })
      .from(Profiles)
      .where(eq(Profiles.id, fixture.profile.id))
      .then(firstOrThrow)
      .then(({ bio }) => bio),
    'Committed despite delivery failure',
  );
  assert.equal(errorLog.mock.callCount(), 1);
  assert.equal(
    errorLog.mock.calls[0]?.arguments[0],
    'Post-commit ActivityPub Local Profile Update delivery failed',
  );
  assert.equal(errorLog.mock.calls[0]?.arguments[1]?.profileId, fixture.profile.id);
});
