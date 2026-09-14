import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import {
  ActivityPubActors,
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileMigrations,
  Profiles,
} from '../db';
import { InstanceKind, ProfileFollowPolicy } from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { prepareProfileMigration } from './profile-migration';

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
  await pg.end();
});

const createProfileFixture = async ({
  followPolicy = ProfileFollowPolicy.OPEN,
  instanceKind = InstanceKind.LOCAL,
  withActor = instanceKind === InstanceKind.ACTIVITYPUB,
}: {
  followPolicy?: ProfileFollowPolicy;
  instanceKind?: InstanceKind;
  withActor?: boolean;
} = {}) => {
  const suffix = randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
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
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(profile.id);

  if (withActor) {
    await db.insert(ActivityPubActors).values({
      inboxUri: `https://${instance.domain}/users/${suffix}/inbox`,
      profileId: profile.id,
      sharedInboxUri: `https://${instance.domain}/inbox`,
      type: 'PERSON',
      uri: `https://${instance.domain}/users/${suffix}`,
    });
  }

  return { instance, profile };
};

test('migration source는 ACTIVE·비정지 Remote Actor만 허용한다', async () => {
  const target = await createProfileFixture({
    followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
  });
  const remote = await createProfileFixture({ instanceKind: InstanceKind.ACTIVITYPUB });
  await prepareProfileMigration({
    sourceProfileId: remote.profile.id,
    targetProfileId: target.profile.id,
  });

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
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  } as const;

  await prepareProfileMigration(input);
  const firstMigration = await db
    .select({
      id: ProfileMigrations.id,
      sourceProfileId: ProfileMigrations.sourceProfileId,
      targetProfileId: ProfileMigrations.targetProfileId,
    })
    .from(ProfileMigrations)
    .where(eq(ProfileMigrations.targetProfileId, target.profile.id))
    .then(firstOrThrow);
  await prepareProfileMigration(input);
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
    sourceProfileId: firstSource.profile.id,
    targetProfileId: firstTarget.profile.id,
  });

  await assert.rejects(
    prepareProfileMigration({
      sourceProfileId: firstSource.profile.id,
      targetProfileId: secondTarget.profile.id,
    }),
    ConflictError,
  );
  await assert.rejects(
    prepareProfileMigration({
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
    sourceProfileId: source.profile.id,
    targetProfileId: target.profile.id,
  } as const;

  await Promise.all([prepareProfileMigration(input), prepareProfileMigration(input)]);

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

test('source와 target이 같으면 migration을 만들지 않고 거부한다', async () => {
  const profile = await createProfileFixture();

  await assert.rejects(
    prepareProfileMigration({
      sourceProfileId: profile.profile.id,
      targetProfileId: profile.profile.id,
    }),
    ConflictError,
  );

  assert.deepEqual(
    await db
      .select()
      .from(ProfileMigrations)
      .where(eq(ProfileMigrations.targetProfileId, profile.profile.id)),
    [],
  );
});
