import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  AccountProfiles,
  Accounts,
  Bookmarks,
  db,
  firstOrThrow,
  Instances,
  isUniqueViolation,
  Notifications,
  pg,
  PostContents,
  Posts,
  ProfileFollowRequests,
  ProfileFollows,
  ProfileMutes,
  Profiles,
  Reactions,
} from '../db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  NotificationKind,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { ConflictError, NotFoundError } from '../error';
import {
  cacheHomeTimelinePage,
  invalidateHomeTimelines,
  readHomeTimelineCache,
} from '../home-timeline/cache';
import { postContentDocumentFromText } from '../post-content/server';
import { runRedisCommand } from '../redis/client';
import { muteProfile, unmuteProfile } from './profile-mute';

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;
const previousRedisUrl = process.env.REDIS_URL;
if (testRedisUrl) {
  process.env.REDIS_URL = testRedisUrl;
}

after(async () => {
  await pg.end();
  if (previousRedisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = previousRedisUrl;
  }
});

const profileAccountIds = new Map<string, string>();

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
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: `subject-${suffix}`, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
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
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  profileAccountIds.set(profile.id, account.id);

  return { account, instance, profile };
};

const cleanupProfiles = async (profileIds: readonly string[], instanceIds: readonly string[]) => {
  const accountIds = profileIds.flatMap((profileId) => {
    const accountId = profileAccountIds.get(profileId);
    return accountId == null ? [] : [accountId];
  });
  await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
  await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
  await db.delete(Instances).where(inArray(Instances.id, instanceIds));
  for (const profileId of profileIds) {
    profileAccountIds.delete(profileId);
  }
};

const waitForRedis = async () => {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const ping = await runRedisCommand((client) => client.ping());
    if (ping?.value === 'PONG') {
      return;
    }
    await delay(25);
  }
  assert.fail('Redis test service did not become ready');
};

const waitForMissingHomeTimeline = async (profileId: string) => {
  const deadline = performance.now() + 2_000;
  while (performance.now() < deadline) {
    const [ping, cache] = await Promise.all([
      runRedisCommand((client) => client.ping()),
      readHomeTimelineCache({ profileId, limit: 10 }),
    ]);
    if (ping?.value === 'PONG' && cache === null) {
      return;
    }
    await delay(10);
  }
  assert.fail('Home timeline cache was not invalidated');
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

test('유효한 Owner는 Local·Remote Target을 영구 Mute한다', async () => {
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
    assert.deepEqual(
      new Set(
        (
          await db
            .select({ targetProfileId: ProfileMutes.targetProfileId })
            .from(ProfileMutes)
            .where(
              and(
                eq(ProfileMutes.ownerProfileId, owner.profile.id),
                isNull(ProfileMutes.expiresAt),
              ),
            )
        ).map(({ targetProfileId }) => targetProfileId),
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
  const disabledOwner = await createProfile({ profileState: ProfileState.DISABLED });
  const suspendedOwner = await createProfile({ instanceState: InstanceState.SUSPENDED });
  const target = await createProfile();
  const profileIds = [
    owner.profile.id,
    disabledOwner.profile.id,
    suspendedOwner.profile.id,
    target.profile.id,
  ];
  const instanceIds = [
    owner.instance.id,
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
    for (const invalidOwner of [disabledOwner, suspendedOwner]) {
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

test('Mute action은 비가시화된 Target을 거부하고 관계를 만들지 않는다', async () => {
  const owner = await createProfile();
  const disabledTarget = await createProfile({ profileState: ProfileState.DISABLED });
  const suspendedTarget = await createProfile({ instanceState: InstanceState.SUSPENDED });

  try {
    await assert.rejects(
      muteProfile({
        ownerProfileId: owner.profile.id,
        targetProfileId: disabledTarget.profile.id,
      }),
      NotFoundError,
    );
    await assert.rejects(
      muteProfile({
        ownerProfileId: owner.profile.id,
        targetProfileId: suspendedTarget.profile.id,
      }),
      NotFoundError,
    );
    assert.equal(await db.$count(ProfileMutes), 0);
  } finally {
    await cleanupProfiles(
      [owner.profile.id, disabledTarget.profile.id, suspendedTarget.profile.id],
      [owner.instance.id, disabledTarget.instance.id, suspendedTarget.instance.id],
    );
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

test('unmuteProfile은 Owner·관계 ID만 제거하고 다른 Owner에는 null을 반환한다', async () => {
  const owner = await createProfile();
  const otherOwner = await createProfile();
  const target = await createProfile({ kind: InstanceKind.ACTIVITYPUB });

  try {
    const input = { ownerProfileId: owner.profile.id, targetProfileId: target.profile.id };
    const created = await muteProfile(input);
    const wrongOwnerResult = await unmuteProfile({
      ownerProfileId: otherOwner.profile.id,
      profileMuteId: created.id,
    });
    assert.equal(wrongOwnerResult, null);
    assert.equal(
      await db.$count(
        ProfileMutes,
        and(
          eq(ProfileMutes.ownerProfileId, input.ownerProfileId),
          eq(ProfileMutes.targetProfileId, input.targetProfileId),
          isNull(ProfileMutes.expiresAt),
        ),
      ),
      1,
    );

    const removed = await unmuteProfile({
      ownerProfileId: owner.profile.id,
      profileMuteId: created.id,
    });
    assert.equal(removed?.id, created.id);
    assert.deepEqual(
      await db
        .select()
        .from(ProfileMutes)
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, input.ownerProfileId),
            eq(ProfileMutes.targetProfileId, input.targetProfileId),
            isNull(ProfileMutes.expiresAt),
          ),
        ),
      [],
    );
    assert.equal(
      await unmuteProfile({ ownerProfileId: owner.profile.id, profileMuteId: created.id }),
      null,
    );
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

    assert.deepEqual(
      await db
        .select()
        .from(ProfileMutes)
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, owner.profile.id),
            eq(ProfileMutes.targetProfileId, target.profile.id),
            isNull(ProfileMutes.expiresAt),
          ),
        ),
      [],
    );
    const remuted = await muteProfile({
      ownerProfileId: owner.profile.id,
      targetProfileId: target.profile.id,
    });

    assert.equal(remuted.id, existing.id);
    assert.equal(remuted.expiresAt, null);
    assert.deepEqual(
      await db
        .select({ id: ProfileMutes.id, expiresAt: ProfileMutes.expiresAt })
        .from(ProfileMutes)
        .where(
          and(
            eq(ProfileMutes.ownerProfileId, owner.profile.id),
            eq(ProfileMutes.targetProfileId, target.profile.id),
            isNull(ProfileMutes.expiresAt),
          ),
        ),
      [{ id: existing.id, expiresAt: null }],
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
      recipientAccountId: owner.account.id,
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
        recipientAccountId: Notifications.recipientAccountId,
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
    const created = await muteProfile({
      ownerProfileId: owner.profile.id,
      targetProfileId: target.profile.id,
    });
    await unmuteProfile({ ownerProfileId: owner.profile.id, profileMuteId: created.id });
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

test(
  'Profile Mute와 해제는 실제 Home 캐시를 갱신하고 중복·무효 변경은 보존한다',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const owner = await createProfile();
    const target = await createProfile();
    const postContent = await db
      .insert(PostContents)
      .values({ document: postContentDocumentFromText('mute home timeline test') })
      .returning()
      .then(firstOrThrow);
    const post = await db
      .insert(Posts)
      .values({
        currentContentId: postContent.id,
        profileId: target.profile.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    await db
      .update(PostContents)
      .set({ postId: post.id })
      .where(eq(PostContents.id, postContent.id));
    await db.insert(ProfileFollows).values({
      followerProfileId: owner.profile.id,
      followeeProfileId: target.profile.id,
    });

    try {
      await cacheHomeTimelinePage({ profileId: owner.profile.id, postIds: [post.id] });
      assert.deepEqual(
        (await readHomeTimelineCache({ profileId: owner.profile.id, limit: 10 }))?.entries.map(
          ({ postId }) => postId,
        ),
        [post.id],
      );

      const mute = await muteProfile({
        ownerProfileId: owner.profile.id,
        targetProfileId: target.profile.id,
      });
      await waitForMissingHomeTimeline(owner.profile.id);

      assert.equal(
        (await unmuteProfile({ ownerProfileId: owner.profile.id, profileMuteId: mute.id }))?.id,
        mute.id,
      );
      await waitForMissingHomeTimeline(owner.profile.id);
      await cacheHomeTimelinePage({ profileId: owner.profile.id, postIds: [post.id] });
      assert.deepEqual(
        (await readHomeTimelineCache({ profileId: owner.profile.id, limit: 10 }))?.entries.map(
          ({ postId }) => postId,
        ),
        [post.id],
      );

      assert.equal(
        await unmuteProfile({
          ownerProfileId: owner.profile.id,
          profileMuteId: crypto.randomUUID(),
        }),
        null,
      );
      assert.deepEqual(
        (await readHomeTimelineCache({ profileId: owner.profile.id, limit: 10 }))?.entries.map(
          ({ postId }) => postId,
        ),
        [post.id],
      );
    } finally {
      await invalidateHomeTimelines({ profileIds: [owner.profile.id] });
      await db.delete(ProfileMutes).where(eq(ProfileMutes.ownerProfileId, owner.profile.id));
      await db.delete(ProfileFollows).where(eq(ProfileFollows.followerProfileId, owner.profile.id));
      await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, post.id));
      await db
        .update(PostContents)
        .set({ postId: null })
        .where(eq(PostContents.id, postContent.id));
      await db.delete(Posts).where(eq(Posts.id, post.id));
      await db.delete(PostContents).where(eq(PostContents.id, postContent.id));
      await cleanupProfiles(
        [owner.profile.id, target.profile.id],
        [owner.instance.id, target.instance.id],
      );
    }
  },
);
