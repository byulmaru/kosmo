import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  ActivityPubActors,
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileMigrations,
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
import { ConflictError, NotFoundError, PermissionDeniedError } from '../error';
import { assertProfileMigrationTarget, prepareProfileMigration } from './profile-migration';

const accountIds: string[] = [];
const instanceIds: string[] = [];
const profileIds: string[] = [];

after(async () => {
  if (profileIds.length > 0) {
    await db
      .delete(ProfileMigrations)
      .where(
        or(
          inArray(ProfileMigrations.sourceProfileId, profileIds),
          inArray(ProfileMigrations.targetProfileId, profileIds),
        ),
      );
    await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
  }
  if (instanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, instanceIds));
  }
  if (accountIds.length > 0) {
    await db.delete(AccountProfiles).where(inArray(AccountProfiles.accountId, accountIds));
    await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
  }
  await pg.end();
});

const createProfileFixture = async ({
  accountState = AccountState.ACTIVE,
  followPolicy = ProfileFollowPolicy.OPEN,
  instanceKind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
  profileState = ProfileState.ACTIVE,
  role = AccountProfileRole.OWNER,
  withActor = instanceKind === InstanceKind.ACTIVITYPUB,
}: {
  accountState?: AccountState;
  followPolicy?: ProfileFollowPolicy;
  instanceKind?: InstanceKind;
  instanceState?: InstanceState;
  profileState?: ProfileState;
  role?: AccountProfileRole;
  withActor?: boolean;
} = {}) => {
  const suffix = randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: profileState,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);

  const account = await db
    .insert(Accounts)
    .values({
      displayName: suffix,
      oidcSubject: suffix,
      state: accountState,
    })
    .returning()
    .then(firstOrThrow);
  accountIds.push(account.id);

  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role,
  });

  if (withActor) {
    await db.insert(ActivityPubActors).values({
      inboxUri: `https://${instance.domain}/users/${suffix}/inbox`,
      profileId: profile.id,
      sharedInboxUri: `https://${instance.domain}/inbox`,
      type: 'PERSON',
      uri: `https://${instance.domain}/users/${suffix}`,
    });
  }

  return { account, instance, profile };
};

test('migration target은 ACTIVE account의 OWNER에게만 공개되고 결과를 재사용한다', async () => {
  const owner = await createProfileFixture();
  const target = await assertProfileMigrationTarget({
    accountId: owner.account.id,
    targetProfileId: owner.profile.id,
  });
  assert.equal(target.id, owner.profile.id);

  const member = await createProfileFixture({ role: AccountProfileRole.MEMBER });
  await assert.rejects(
    assertProfileMigrationTarget({
      accountId: member.account.id,
      targetProfileId: member.profile.id,
    }),
    PermissionDeniedError,
  );

  const inactiveAccount = await createProfileFixture({ accountState: AccountState.DISABLED });
  await assert.rejects(
    assertProfileMigrationTarget({
      accountId: inactiveAccount.account.id,
      targetProfileId: inactiveAccount.profile.id,
    }),
    PermissionDeniedError,
  );
});

test('migration target은 Local·OPEN·ACTIVE 조합만 허용한다', async () => {
  const approvalRequired = await createProfileFixture({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
  });
  const remote = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const suspendedInstance = await createProfileFixture({
    instanceState: InstanceState.SUSPENDED,
  });
  const disabledProfile = await createProfileFixture({ profileState: ProfileState.DISABLED });

  for (const fixture of [approvalRequired, remote, suspendedInstance, disabledProfile]) {
    await assert.rejects(
      assertProfileMigrationTarget({
        accountId: fixture.account.id,
        targetProfileId: fixture.profile.id,
      }),
      NotFoundError,
    );
  }
});

test('migration source는 ACTIVE·비정지 Remote Actor만 허용한다', async () => {
  const target = await createProfileFixture();
  const remote = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const prepared = await prepareProfileMigration({
    accountId: target.account.id,
    sourceProfileId: remote.profile.id,
    targetProfileId: target.profile.id,
  });

  assert.equal(prepared.id, target.profile.id);
  const [migration] = await db
    .select()
    .from(ProfileMigrations)
    .where(eq(ProfileMigrations.targetProfileId, target.profile.id));
  assert.deepEqual(
    {
      sourceProfileId: migration?.sourceProfileId,
      targetProfileId: migration?.targetProfileId,
    },
    {
      sourceProfileId: remote.profile.id,
      targetProfileId: target.profile.id,
    },
  );

  const localSource = await createProfileFixture();
  await assert.rejects(
    prepareProfileMigration({
      accountId: target.account.id,
      sourceProfileId: localSource.profile.id,
      targetProfileId: target.profile.id,
    }),
    NotFoundError,
  );

  const remoteWithoutActor = await createProfileFixture({
    instanceKind: InstanceKind.ACTIVITYPUB,
    withActor: false,
  });
  await assert.rejects(
    prepareProfileMigration({
      accountId: target.account.id,
      sourceProfileId: remoteWithoutActor.profile.id,
      targetProfileId: target.profile.id,
    }),
    NotFoundError,
  );
});

test('같은 migration pair는 DB row를 멱등 재사용한다', async () => {
  const target = await createProfileFixture();
  const source = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const input = {
    accountId: target.account.id,
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  } as const;

  const first = await prepareProfileMigration(input);
  const firstMigration = await db
    .select({
      id: ProfileMigrations.id,
      sourceProfileId: ProfileMigrations.sourceProfileId,
      targetProfileId: ProfileMigrations.targetProfileId,
    })
    .from(ProfileMigrations)
    .where(eq(ProfileMigrations.targetProfileId, target.profile.id))
    .then(firstOrThrow);
  const duplicate = await prepareProfileMigration(input);

  assert.equal(first.id, target.profile.id);
  assert.equal(duplicate.id, target.profile.id);
  const migrations = await db
    .select({
      id: ProfileMigrations.id,
      sourceProfileId: ProfileMigrations.sourceProfileId,
      targetProfileId: ProfileMigrations.targetProfileId,
    })
    .from(ProfileMigrations)
    .where(eq(ProfileMigrations.targetProfileId, target.profile.id));
  assert.deepEqual(migrations, [firstMigration]);
});

test('서로 다른 source와 target이 기존 pair의 양쪽 unique 제약과 충돌한다', async () => {
  const firstTarget = await createProfileFixture();
  const secondTarget = await createProfileFixture();
  const firstSource = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const secondSource = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });

  await prepareProfileMigration({
    accountId: firstTarget.account.id,
    sourceProfileId: firstSource.profile.id,
    targetProfileId: firstTarget.profile.id,
  });

  await assert.rejects(
    prepareProfileMigration({
      accountId: secondTarget.account.id,
      sourceProfileId: firstSource.profile.id,
      targetProfileId: secondTarget.profile.id,
    }),
    ConflictError,
  );
  await assert.rejects(
    prepareProfileMigration({
      accountId: firstTarget.account.id,
      sourceProfileId: secondSource.profile.id,
      targetProfileId: firstTarget.profile.id,
    }),
    ConflictError,
  );
});

test('동시 동일 요청은 DB unique 제약으로 하나의 migration만 만들고 나머지는 재사용한다', async () => {
  const target = await createProfileFixture();
  const source = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  const input = {
    accountId: target.account.id,
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  } as const;

  const results = await Promise.all([
    prepareProfileMigration(input),
    prepareProfileMigration(input),
  ]);

  assert.deepEqual(
    results.map(({ id }) => id),
    [target.profile.id, target.profile.id],
  );
  const migrations = await db
    .select({
      sourceProfileId: ProfileMigrations.sourceProfileId,
      targetProfileId: ProfileMigrations.targetProfileId,
    })
    .from(ProfileMigrations)
    .where(eq(ProfileMigrations.targetProfileId, target.profile.id));
  assert.deepEqual(migrations, [
    {
      sourceProfileId: source.profile.id,
      targetProfileId: target.profile.id,
    },
  ]);
});
