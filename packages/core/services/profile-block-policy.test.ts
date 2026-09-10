import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { inArray } from 'drizzle-orm';
import { db, firstOrThrow, Instances, pg, ProfileBlocks, Profiles } from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '../enums';
import { assertProfilePairIsNotBlocked, ProfilePairBlockedError } from './profile-block-policy';

const profileIds = new Set<string>();
const instanceIds = new Set<string>();

const createProfile = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.add(instance.id);

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.add(profile.id);
  return profile;
};

afterEach(async () => {
  if (profileIds.size > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, [...profileIds]));
  }
  if (instanceIds.size > 0) {
    await db.delete(Instances).where(inArray(Instances.id, [...instanceIds]));
  }
  profileIds.clear();
  instanceIds.clear();
});

after(async () => pg.end());

test('block이 없으면 Profile pair admission assertion은 resolve한다', async () => {
  const firstProfile = await createProfile();
  const secondProfile = await createProfile();

  await db.transaction((tx) =>
    assertProfilePairIsNotBlocked(tx, {
      firstProfileId: firstProfile.id,
      secondProfileId: secondProfile.id,
    }),
  );
});

test('어느 방향이든 Active Block이 있으면 ProfilePairBlockedError를 던진다', async () => {
  const owner = await createProfile();
  const target = await createProfile();
  await db.insert(ProfileBlocks).values({
    ownerProfileId: owner.id,
    targetProfileId: target.id,
  });

  await assert.rejects(
    db.transaction((tx) =>
      assertProfilePairIsNotBlocked(tx, {
        firstProfileId: owner.id,
        secondProfileId: target.id,
      }),
    ),
    ProfilePairBlockedError,
  );
  await assert.rejects(
    db.transaction((tx) =>
      assertProfilePairIsNotBlocked(tx, {
        firstProfileId: target.id,
        secondProfileId: owner.id,
      }),
    ),
    ProfilePairBlockedError,
  );
});

test('동일 Profile pair 입력은 Block row가 없으면 통과한다', async () => {
  const profile = await createProfile();

  await db.transaction((tx) =>
    assertProfilePairIsNotBlocked(tx, {
      firstProfileId: profile.id,
      secondProfileId: profile.id,
    }),
  );
});
