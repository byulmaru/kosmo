import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  Bookmarks,
  db,
  findProfileMute,
  findProfileMutesByOwner,
  firstOrThrow,
  Instances,
  isProfileMuted,
  isUniqueViolation,
  Notifications,
  pg,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileMutes,
  Profiles,
  Reactions,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { ConflictError, NotFoundError } from '../error';
import { muteProfile, unmuteProfile } from './profile-mute';

after(async () => pg.end());

const createProfile = async ({
  kind = InstanceKind.LOCAL,
  instanceState = InstanceState.ACTIVE,
  profileState = ProfileState.ACTIVE,
}: {
  kind?: InstanceKind;
  instanceState?: InstanceState;
  profileState?: ProfileState;
} = {}) => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind, state: instanceState })
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

  return { instance, profile };
};

const cleanupProfiles = async (profileIds: readonly string[], instanceIds: readonly string[]) => {
  await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
  await db.delete(Instances).where(inArray(Instances.id, instanceIds));
};

test('Profile Mute는 Owner·Target과 nullable expiresAt을 저장한다', async () => {
  const owner = await createProfile();
  const target = await createProfile();

  try {
    const mute = await db
      .insert(ProfileMutes)
      .values({ ownerProfileId: owner.profile.id, targetProfileId: target.profile.id })
      .returning()
      .then(firstOrThrow);

    assert.equal(mute.ownerProfileId, owner.profile.id);
    assert.equal(mute.targetProfileId, target.profile.id);
    assert.equal(mute.expiresAt, null);
  } finally {
    await cleanupProfiles(
      [owner.profile.id, target.profile.id],
      [owner.instance.id, target.instance.id],
    );
  }
});

test('같은 Owner·Target Profile Mute는 하나의 관계로 제한된다', async () => {
  const owner = await createProfile();
  const target = await createProfile();

  try {
    await db
      .insert(ProfileMutes)
      .values({ ownerProfileId: owner.profile.id, targetProfileId: target.profile.id });

    await assert.rejects(
      db
        .insert(ProfileMutes)
        .values({ ownerProfileId: owner.profile.id, targetProfileId: target.profile.id }),
      isUniqueViolation,
    );
    assert.equal(
      await db
        .select()
        .from(ProfileMutes)
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, owner.profile.id),
            eq(ProfileMutes.targetProfileId, target.profile.id),
          ),
        )
        .then((rows) => rows.length),
      1,
    );
  } finally {
    await cleanupProfiles(
      [owner.profile.id, target.profile.id],
      [owner.instance.id, target.instance.id],
    );
  }
});

test('Owner 또는 Target Profile 삭제 시 Profile Mute 관계가 cascade 정리된다', async () => {
  const owner = await createProfile();
  const target = await createProfile();

  try {
    await db
      .insert(ProfileMutes)
      .values({ ownerProfileId: owner.profile.id, targetProfileId: target.profile.id });
    await db.delete(Profiles).where(eq(Profiles.id, owner.profile.id));

    assert.equal(
      await db.$count(ProfileMutes, eq(ProfileMutes.targetProfileId, target.profile.id)),
      0,
    );
  } finally {
    await cleanupProfiles(
      [owner.profile.id, target.profile.id],
      [owner.instance.id, target.instance.id],
    );
  }
});

test('유효한 Local Owner는 Local·Remote Target을 영구 Mute한다', async () => {
  const owner = await createProfile();
  const localTarget = await createProfile();
  const remoteTarget = await createProfile({ kind: InstanceKind.ACTIVITYPUB });

  try {
    const [localMute, remoteMute] = await Promise.all([
      muteProfile({ ownerProfileId: owner.profile.id, targetProfileId: localTarget.profile.id }),
      muteProfile({ ownerProfileId: owner.profile.id, targetProfileId: remoteTarget.profile.id }),
    ]);

    assert.equal(localMute.ownerProfileId, owner.profile.id);
    assert.equal(localMute.targetProfileId, localTarget.profile.id);
    assert.equal(localMute.expiresAt, null);
    assert.equal(remoteMute.ownerProfileId, owner.profile.id);
    assert.equal(remoteMute.targetProfileId, remoteTarget.profile.id);
    assert.equal(await isProfileMuted(owner.profile.id, localTarget.profile.id), true);
    assert.equal(await isProfileMuted(owner.profile.id, remoteTarget.profile.id), true);
    assert.deepEqual(
      new Set(
        (await findProfileMutesByOwner(owner.profile.id)).map(
          ({ targetProfileId }) => targetProfileId,
        ),
      ),
      new Set([localTarget.profile.id, remoteTarget.profile.id]),
    );
  } finally {
    await cleanupProfiles(
      [owner.profile.id, localTarget.profile.id, remoteTarget.profile.id],
      [owner.instance.id, localTarget.instance.id, remoteTarget.instance.id],
    );
  }
});

test('Mute action은 self-target·존재하지 않는 Target·자격 없는 Owner를 거부한다', async () => {
  const owner = await createProfile();
  const remoteOwner = await createProfile({ kind: InstanceKind.ACTIVITYPUB });
  const disabledOwner = await createProfile({ profileState: ProfileState.DISABLED });
  const suspendedOwner = await createProfile({ instanceState: InstanceState.SUSPENDED });
  const target = await createProfile();
  const profileIds = [
    owner.profile.id,
    remoteOwner.profile.id,
    disabledOwner.profile.id,
    suspendedOwner.profile.id,
    target.profile.id,
  ];
  const instanceIds = [
    owner.instance.id,
    remoteOwner.instance.id,
    disabledOwner.instance.id,
    suspendedOwner.instance.id,
    target.instance.id,
  ];

  try {
    await assert.rejects(
      muteProfile({ ownerProfileId: owner.profile.id, targetProfileId: owner.profile.id }),
      ConflictError,
    );
    await assert.rejects(
      muteProfile({ ownerProfileId: owner.profile.id, targetProfileId: crypto.randomUUID() }),
      NotFoundError,
    );
    for (const invalidOwner of [remoteOwner, disabledOwner, suspendedOwner]) {
      await assert.rejects(
        muteProfile({
          ownerProfileId: invalidOwner.profile.id,
          targetProfileId: target.profile.id,
        }),
        NotFoundError,
      );
    }

    assert.equal(
      await db.$count(ProfileMutes, inArray(ProfileMutes.ownerProfileId, profileIds)),
      0,
    );
  } finally {
    await cleanupProfiles(profileIds, instanceIds);
  }
});

test('Mute action의 순차·동시 중복 생성은 하나의 nullable 관계로 수렴한다', async () => {
  const owner = await createProfile();
  const target = await createProfile({ kind: InstanceKind.ACTIVITYPUB });

  try {
    const input = { ownerProfileId: owner.profile.id, targetProfileId: target.profile.id };
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => muteProfile(input)));
    const repeated = await muteProfile(input);
    const ids = new Set(concurrent.map(({ id }) => id));

    assert.equal(ids.size, 1);
    assert.equal(repeated.id, concurrent[0]!.id);
    assert.ok(concurrent.every(({ expiresAt }) => expiresAt === null));
    assert.equal(
      await db.$count(
        ProfileMutes,
        and(
          eq(ProfileMutes.ownerProfileId, owner.profile.id),
          eq(ProfileMutes.targetProfileId, target.profile.id),
        ),
      ),
      1,
    );
  } finally {
    await cleanupProfiles(
      [owner.profile.id, target.profile.id],
      [owner.instance.id, target.instance.id],
    );
  }
});

test('unmuteProfile은 Owner·Target 쌍만 제거하고 다른 Owner에는 null을 반환한다', async () => {
  const owner = await createProfile();
  const otherOwner = await createProfile();
  const target = await createProfile({ kind: InstanceKind.ACTIVITYPUB });

  try {
    const input = { ownerProfileId: owner.profile.id, targetProfileId: target.profile.id };
    const created = await muteProfile(input);
    const wrongOwnerResult = await unmuteProfile({
      ownerProfileId: otherOwner.profile.id,
      targetProfileId: target.profile.id,
    });
    assert.equal(wrongOwnerResult, null);
    assert.equal(await isProfileMuted(input.ownerProfileId, input.targetProfileId), true);

    const removed = await unmuteProfile(input);
    assert.equal(removed?.id, created.id);
    assert.equal(await findProfileMute(input.ownerProfileId, input.targetProfileId), null);
    assert.equal(await isProfileMuted(input.ownerProfileId, input.targetProfileId), false);
    assert.equal(await unmuteProfile(input), null);
  } finally {
    await cleanupProfiles(
      [owner.profile.id, otherOwner.profile.id, target.profile.id],
      [owner.instance.id, otherOwner.instance.id, target.instance.id],
    );
  }
});

test('기존 미래 만료 Mute를 다시 생성하면 같은 row가 영구 관계로 수렴한다', async () => {
  const owner = await createProfile();
  const target = await createProfile();

  try {
    const existing = await db
      .insert(ProfileMutes)
      .values({
        ownerProfileId: owner.profile.id,
        targetProfileId: target.profile.id,
        expiresAt: Temporal.Instant.from('2099-01-01T00:00:00Z'),
      })
      .returning()
      .then(firstOrThrow);

    assert.equal(await findProfileMute(owner.profile.id, target.profile.id), null);
    assert.equal(await isProfileMuted(owner.profile.id, target.profile.id), false);
    assert.deepEqual(await findProfileMutesByOwner(owner.profile.id), []);

    const remuted = await muteProfile({
      ownerProfileId: owner.profile.id,
      targetProfileId: target.profile.id,
    });

    assert.equal(remuted.id, existing.id);
    assert.equal(remuted.expiresAt, null);
    assert.equal((await findProfileMute(owner.profile.id, target.profile.id))?.id, existing.id);
    assert.equal(await isProfileMuted(owner.profile.id, target.profile.id), true);
    assert.deepEqual(
      (await findProfileMutesByOwner(owner.profile.id)).map(({ id }) => id),
      [existing.id],
    );
  } finally {
    await cleanupProfiles(
      [owner.profile.id, target.profile.id],
      [owner.instance.id, target.instance.id],
    );
  }
});

test('Mute 생성·해제는 기존 관계·상호작용·Notification 상태를 바꾸지 않는다', async () => {
  const owner = await createProfile();
  const target = await createProfile();
  const sourcePost = await db
    .insert(Posts)
    .values({
      profileId: target.profile.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  const repost = await db
    .insert(Posts)
    .values({
      profileId: owner.profile.id,
      repostSourceId: sourcePost.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  const follow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId: owner.profile.id, followeeProfileId: target.profile.id })
    .returning()
    .then(firstOrThrow);
  const followRequest = await db
    .insert(ProfileFollowRequests)
    .values({ followerProfileId: target.profile.id, followeeProfileId: owner.profile.id })
    .returning()
    .then(firstOrThrow);
  const reaction = await db
    .insert(Reactions)
    .values({ profileId: owner.profile.id, postId: sourcePost.id, type: 'LIKE' })
    .returning()
    .then(firstOrThrow);
  const bookmark = await db
    .insert(Bookmarks)
    .values({ profileId: owner.profile.id, postId: sourcePost.id })
    .returning()
    .then(firstOrThrow);
  const notification = await db
    .insert(Notifications)
    .values({
      kind: NotificationKind.FOLLOW,
      readAt: Temporal.Instant.from('2026-01-01T00:00:00Z'),
      recipientProfileId: owner.profile.id,
      sourceId: follow.id,
    })
    .returning()
    .then(firstOrThrow);

  const snapshot = async () => ({
    bookmark: await db
      .select({ id: Bookmarks.id, postId: Bookmarks.postId, profileId: Bookmarks.profileId })
      .from(Bookmarks)
      .where(eq(Bookmarks.id, bookmark.id)),
    follow: await db
      .select({
        followerProfileId: ProfileFollows.followerProfileId,
        followeeProfileId: ProfileFollows.followeeProfileId,
        id: ProfileFollows.id,
      })
      .from(ProfileFollows)
      .where(eq(ProfileFollows.id, follow.id)),
    followRequest: await db
      .select({
        followerProfileId: ProfileFollowRequests.followerProfileId,
        followeeProfileId: ProfileFollowRequests.followeeProfileId,
        id: ProfileFollowRequests.id,
      })
      .from(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, followRequest.id)),
    notification: await db
      .select({
        id: Notifications.id,
        kind: Notifications.kind,
        readAt: Notifications.readAt,
        recipientProfileId: Notifications.recipientProfileId,
        sourceId: Notifications.sourceId,
      })
      .from(Notifications)
      .where(eq(Notifications.id, notification.id))
      .then((rows) => rows.map((row) => ({ ...row, readAt: row.readAt?.toString() ?? null }))),
    reaction: await db
      .select({
        id: Reactions.id,
        postId: Reactions.postId,
        profileId: Reactions.profileId,
        type: Reactions.type,
      })
      .from(Reactions)
      .where(eq(Reactions.id, reaction.id)),
    repost: await db
      .select({ id: Posts.id, profileId: Posts.profileId, repostSourceId: Posts.repostSourceId })
      .from(Posts)
      .where(eq(Posts.id, repost.id)),
    sourcePost: await db
      .select({ id: Posts.id, profileId: Posts.profileId, repostSourceId: Posts.repostSourceId })
      .from(Posts)
      .where(eq(Posts.id, sourcePost.id)),
  });

  try {
    const before = await snapshot();
    await muteProfile({ ownerProfileId: owner.profile.id, targetProfileId: target.profile.id });
    await unmuteProfile({ ownerProfileId: owner.profile.id, targetProfileId: target.profile.id });
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.delete(Notifications).where(eq(Notifications.id, notification.id));
    await db.delete(Bookmarks).where(eq(Bookmarks.id, bookmark.id));
    await db.delete(Reactions).where(eq(Reactions.id, reaction.id));
    await db.delete(Posts).where(eq(Posts.id, repost.id));
    await db.delete(Posts).where(eq(Posts.id, sourcePost.id));
    await db.delete(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, followRequest.id));
    await db.delete(ProfileFollows).where(eq(ProfileFollows.id, follow.id));
    await cleanupProfiles(
      [owner.profile.id, target.profile.id],
      [owner.instance.id, target.instance.id],
    );
  }
});
