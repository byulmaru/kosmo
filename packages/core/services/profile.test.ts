import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import {
  Accounts,
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileFollows,
  Profiles,
  Sessions,
} from '../db';
import {
  AccountState,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '../enums';
import { disableProfile } from './profile';
import { createProfileFollow } from './profile-follow';

after(async () => pg.end());

test('disableProfile은 profile lifecycle과 active session 정리를 소유한다', async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
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
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const followee = await db
    .insert(Profiles)
    .values({
      displayName: `${suffix}-followee`,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: `${suffix}-followee`,
      instanceId: instance.id,
      normalizedHandle: `${suffix}-followee`,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const follower = await db
    .insert(Profiles)
    .values({
      displayName: `${suffix}-follower`,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: `${suffix}-follower`,
      instanceId: instance.id,
      normalizedHandle: `${suffix}-follower`,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: profile.id,
      oidcSessionKey: suffix,
      state: SessionState.ACTIVE,
      token: suffix,
    })
    .returning()
    .then(firstOrThrow);

  try {
    const outgoing = await createProfileFollow({
      followerProfileId: profile.id,
      followeeProfileId: followee.id,
    });
    const incoming = await createProfileFollow({
      followerProfileId: follower.id,
      followeeProfileId: profile.id,
    });

    await disableProfile(profile.id);

    const disabled = await db
      .select()
      .from(Profiles)
      .where(eq(Profiles.id, profile.id))
      .then(firstOrThrow);
    assert.equal(disabled.state, ProfileState.DISABLED);
    assert.equal(
      await db
        .select()
        .from(ProfileFollows)
        .where(inArray(ProfileFollows.id, [outgoing.profileFollow.id, incoming.profileFollow.id]))
        .then((rows) => rows.length),
      2,
    );
    assert.equal(
      await db
        .select()
        .from(Profiles)
        .where(eq(Profiles.id, followee.id))
        .then(firstOrThrow)
        .then(({ followersCount }) => followersCount),
      0,
    );
    assert.equal(
      await db
        .select()
        .from(Profiles)
        .where(eq(Profiles.id, follower.id))
        .then(firstOrThrow)
        .then(({ followingCount }) => followingCount),
      0,
    );
    assert.equal(
      await db
        .select()
        .from(Sessions)
        .where(eq(Sessions.activeProfileId, profile.id))
        .then((rows) => rows.length),
      0,
    );
  } finally {
    await db.delete(Sessions).where(eq(Sessions.id, session.id));
    await db.delete(Accounts).where(eq(Accounts.id, account.id));
    await db.delete(Profiles).where(inArray(Profiles.id, [profile.id, followee.id, follower.id]));
    await db.delete(Instances).where(eq(Instances.id, instance.id));
  }
});
