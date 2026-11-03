import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  pg,
  PostContents,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { runRedisCommand } from '../redis/client';
import {
  cacheHomeTimelinePage,
  fanoutHomeTimelinePost,
  insertHomeTimelinePost,
  invalidateHomeTimelines,
  listHomeTimelineRecipientPage,
  readHomeTimelineCache,
  reconcileHomeTimelineFollow,
  removeHomeTimelinePost,
  touchHomeTimeline,
} from './cache';

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;
const previousRedisUrl = process.env.REDIS_URL;
if (testRedisUrl) {
  process.env.REDIS_URL = testRedisUrl;
}

const profileIds: string[] = [];
const instanceIds: string[] = [];
const postIds: string[] = [];
const contentIds: string[] = [];

after(async () => {
  await invalidateHomeTimelines({ profileIds });
  if (postIds.length > 0) {
    await db
      .update(Posts)
      .set({ currentContentId: null, replyParentId: null, repostSourceId: null })
      .where(inArray(Posts.id, postIds));
  }
  if (contentIds.length > 0) {
    await db.update(PostContents).set({ postId: null }).where(inArray(PostContents.id, contentIds));
  }
  if (postIds.length > 0) {
    await db.delete(Posts).where(inArray(Posts.id, postIds));
  }
  if (contentIds.length > 0) {
    await db.delete(PostContents).where(inArray(PostContents.id, contentIds));
  }
  if (profileIds.length > 0) {
    await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
  }
  if (instanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, instanceIds));
  }
  await pg.end();
  if (previousRedisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = previousRedisUrl;
  }
});

const createProfile = async () => {
  const suffix = randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);
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
  profileIds.push(profile.id);
  return profile;
};

const createProfiles = async (instanceId: string, count: number) => {
  const profiles = await db
    .insert(Profiles)
    .values(
      Array.from({ length: count }, () => {
        const suffix = randomUUID();
        return {
          displayName: suffix,
          followPolicy: ProfileFollowPolicy.OPEN,
          handle: suffix,
          instanceId,
          normalizedHandle: suffix,
          state: ProfileState.ACTIVE,
        };
      }),
    )
    .returning();
  profileIds.push(...profiles.map(({ id }) => id));
  return profiles;
};

const createPost = async ({
  profileId,
  replyParentId,
}: {
  readonly profileId: string;
  readonly replyParentId?: string;
}) => {
  const post = await db
    .insert(Posts)
    .values({
      profileId,
      replyParentId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  postIds.push(post.id);
  const content = await db
    .insert(PostContents)
    .values({ postId: post.id, document: postContentDocumentFromText('home cache post') })
    .returning()
    .then(firstOrThrow);
  contentIds.push(content.id);
  await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
  return post;
};

const waitForRedis = async () => {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const ping = await runRedisCommand((client) => client.ping());
    if (ping?.value === 'PONG') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('Redis test service did not become ready');
};

test(
  'Home cache reads renew the sliding TTL and a touch does not create a missing cache',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const profile = await createProfile();
    const profileId = profile.id;
    const key = `kosmo:home-timeline:profile:${profileId}`;

    await touchHomeTimeline({ profileId });
    assert.equal((await runRedisCommand((client) => client.exists(key)))?.value, 0);
    assert.equal(await readHomeTimelineCache({ profileId, limit: 1 }), null);
    assert.equal((await runRedisCommand((client) => client.exists(key)))?.value, 0);

    await cacheHomeTimelinePage({ profileId, postIds: [] });
    let ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);
    await runRedisCommand((client) => client.expire(key, 60));
    assert.ok(await readHomeTimelineCache({ profileId, limit: 1 }));
    ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);

    await runRedisCommand((client) => client.unlink(key));
  },
);

test(
  'recipient pages advance across missing caches and return only ready candidates',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const author = await createProfile();
    const followers = await createProfiles(author.instanceId, 100);
    await db
      .insert(ProfileFollows)
      .values(followers.map(({ id }) => ({ followerProfileId: id, followeeProfileId: author.id })));
    const post = await createPost({ profileId: author.id });
    const sortedCandidates = [author, ...followers].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const onlyReadyCandidate = sortedCandidates.at(-1)!;
    await cacheHomeTimelinePage({ profileId: onlyReadyCandidate.id, postIds: [] });

    const first = await listHomeTimelineRecipientPage({ postId: post.id });
    assert.deepEqual(first, {
      profileIds: [],
      nextCursor: sortedCandidates[99]!.id,
    });

    const second = await listHomeTimelineRecipientPage({
      postId: post.id,
      afterProfileId: first.nextCursor!,
    });
    assert.deepEqual(second, { profileIds: [onlyReadyCandidate.id], nextCursor: null });
  },
);

test(
  'per-recipient insertion rechecks Home policy, preserves retry score, and skips inactive caches',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const recheckViewer = await createProfile();
    const author = await createProfile();
    await db.insert(ProfileFollows).values([
      { followerProfileId: viewer.id, followeeProfileId: author.id },
      { followerProfileId: recheckViewer.id, followeeProfileId: author.id },
    ]);
    await Promise.all(
      [viewer, recheckViewer].map(({ id }) =>
        cacheHomeTimelinePage({ profileId: id, postIds: [] }),
      ),
    );
    const post = await createPost({ profileId: author.id });
    const viewerKey = `kosmo:home-timeline:profile:${viewer.id}`;
    const recheckKey = `kosmo:home-timeline:profile:${recheckViewer.id}`;

    await runRedisCommand((client) => client.expire(viewerKey, 60));
    await insertHomeTimelinePost({ postId: post.id, profileId: viewer.id });
    const firstScore = (await runRedisCommand((client) => client.zScore(viewerKey, post.id)))
      ?.value;
    assert.ok(firstScore !== null && firstScore !== undefined);
    await insertHomeTimelinePost({ postId: post.id, profileId: viewer.id });
    assert.equal(
      (await runRedisCommand((client) => client.zScore(viewerKey, post.id)))?.value,
      firstScore,
    );
    const ttl = (await runRedisCommand((client) => client.ttl(viewerKey)))?.value;
    assert.ok(ttl !== undefined && ttl <= 60 && ttl > 50, `unexpected TTL ${ttl}`);

    await db
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, recheckViewer.id),
          eq(ProfileFollows.followeeProfileId, author.id),
        ),
      );
    await insertHomeTimelinePost({ postId: post.id, profileId: recheckViewer.id });
    assert.equal(
      (await runRedisCommand((client) => client.zScore(recheckKey, post.id)))?.value,
      null,
    );

    const inactiveViewer = await createProfile();
    const inactiveKey = `kosmo:home-timeline:profile:${inactiveViewer.id}`;
    await insertHomeTimelinePost({ postId: post.id, profileId: inactiveViewer.id });
    assert.equal((await runRedisCommand((client) => client.exists(inactiveKey)))?.value, 0);
  },
);

test(
  'post removal pages tombstoned recipients, preserves unrelated entries, readiness, and expiry',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const author = await createProfile();
    const followers = await createProfiles(author.instanceId, 100);
    const parentOwner = await createProfile();
    const formerFollower = (await createProfiles(author.instanceId, 1))[0]!;
    const recipientProfiles = [author, ...followers, parentOwner];
    const missingCacheViewer = recipientProfiles[0]!;
    const unreadyCacheViewer = recipientProfiles.at(-1)!;
    const parentPost = await createPost({ profileId: parentOwner.id });
    const targetPost = await createPost({
      profileId: author.id,
      replyParentId: parentPost.id,
    });
    await db
      .insert(ProfileFollows)
      .values([
        ...followers.map(({ id }) => ({ followerProfileId: id, followeeProfileId: author.id })),
        { followerProfileId: formerFollower.id, followeeProfileId: author.id },
      ]);
    await db
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, formerFollower.id),
          eq(ProfileFollows.followeeProfileId, author.id),
        ),
      );
    await db
      .update(Posts)
      .set({ deletedAt: sql`now()`, state: PostState.DELETED })
      .where(eq(Posts.id, targetPost.id));

    const retainedPostId = randomUUID();
    const keyFor = (profileId: string) => `kosmo:home-timeline:profile:${profileId}`;
    const formerFollowerKey = keyFor(formerFollower.id);
    await runRedisCommand((client) => {
      const transaction = client.multi();
      for (const { id } of recipientProfiles) {
        if (id === missingCacheViewer.id) {
          continue;
        }
        transaction.zAdd(keyFor(id), [
          ...(id === unreadyCacheViewer.id ? [] : [{ score: -1, value: '__ready__' }]),
          { score: 100, value: targetPost.id },
          { score: 200, value: retainedPostId },
        ]);
        transaction.expire(keyFor(id), 400);
      }
      transaction.zAdd(formerFollowerKey, [
        { score: -1, value: '__ready__' },
        { score: 100, value: targetPost.id },
        { score: 200, value: retainedPostId },
      ]);
      transaction.expire(formerFollowerKey, 400);
      return transaction.exec();
    });

    await removeHomeTimelinePost({ postId: targetPost.id });

    const cacheState = await runRedisCommand((client) => {
      const transaction = client.multi();
      for (const { id } of recipientProfiles) {
        const key = keyFor(id);
        transaction.zScore(key, targetPost.id);
        transaction.zScore(key, retainedPostId);
        transaction.zScore(key, '__ready__');
        transaction.ttl(key);
      }
      transaction.zScore(formerFollowerKey, targetPost.id);
      transaction.zScore(formerFollowerKey, retainedPostId);
      transaction.zScore(formerFollowerKey, '__ready__');
      transaction.ttl(formerFollowerKey);
      return transaction.exec();
    });
    assert.ok(cacheState);
    const values = cacheState.value as unknown as (number | null)[];
    for (const [index, { id }] of recipientProfiles.entries()) {
      const offset = index * 4;
      assert.equal(values[offset], null);
      if (id === missingCacheViewer.id) {
        assert.equal(values[offset + 1], null);
        assert.equal(values[offset + 2], null);
        assert.equal(values[offset + 3], -2);
        continue;
      }
      assert.equal(values[offset + 1], 200);
      assert.equal(values[offset + 2], id === unreadyCacheViewer.id ? null : -1);
      const ttl = values[offset + 3];
      assert.ok(ttl !== null && ttl <= 400 && ttl > 390, `unexpected TTL ${ttl}`);
    }
    const formerFollowerOffset = recipientProfiles.length * 4;
    assert.equal(values[formerFollowerOffset], 100);
    assert.equal(values[formerFollowerOffset + 1], 200);
    assert.equal(values[formerFollowerOffset + 2], -1);
    const formerFollowerTtl = values[formerFollowerOffset + 3];
    assert.ok(
      formerFollowerTtl !== null && formerFollowerTtl <= 400 && formerFollowerTtl > 390,
      `unexpected TTL ${formerFollowerTtl}`,
    );
  },
);

test(
  'follow reconciliation backfills and removes only posts made ineligible by current policy',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const author = await createProfile();
    const followedPost = await createPost({ profileId: author.id });
    const viewerPost = await createPost({ profileId: viewer.id });
    const reply = await createPost({ profileId: author.id, replyParentId: viewerPost.id });
    const repost = await db
      .insert(Posts)
      .values({
        profileId: viewer.id,
        repostSourceId: followedPost.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    postIds.push(repost.id);
    await cacheHomeTimelinePage({
      profileId: viewer.id,
      postIds: [viewerPost.id, reply.id, repost.id],
    });
    const key = `kosmo:home-timeline:profile:${viewer.id}`;
    const replyScoreBefore = (await runRedisCommand((client) => client.zScore(key, reply.id)))
      ?.value;
    const repostScoreBefore = (await runRedisCommand((client) => client.zScore(key, repost.id)))
      ?.value;

    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.id,
      followeeProfileId: author.id,
    });
    await runRedisCommand((client) => client.expire(key, 60));
    await reconcileHomeTimelineFollow({ profileId: viewer.id });
    const followedPostScore = (
      await runRedisCommand((client) => client.zScore(key, followedPost.id))
    )?.value;
    assert.ok(followedPostScore !== null && followedPostScore !== undefined);
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, reply.id)))?.value,
      replyScoreBefore,
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, repost.id)))?.value,
      repostScoreBefore,
    );
    let ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl <= 60 && ttl > 50, `unexpected TTL ${ttl}`);

    await db
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, viewer.id),
          eq(ProfileFollows.followeeProfileId, author.id),
        ),
      );
    await reconcileHomeTimelineFollow({ profileId: viewer.id });
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, followedPost.id)))?.value,
      null,
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, reply.id)))?.value,
      replyScoreBefore,
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, repost.id)))?.value,
      repostScoreBefore,
    );
    ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl <= 60 && ttl > 45, `unexpected TTL ${ttl}`);

    const inactiveViewer = await createProfile();
    const inactiveKey = `kosmo:home-timeline:profile:${inactiveViewer.id}`;
    await reconcileHomeTimelineFollow({ profileId: inactiveViewer.id });
    assert.equal((await runRedisCommand((client) => client.exists(inactiveKey)))?.value, 0);
  },
);

test(
  'Home cache reads distinguish ready-empty from missing and keep score bounds in both directions',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const profileId = randomUUID();
    const key = `kosmo:home-timeline:profile:${profileId}`;
    const olderPostId = randomUUID();
    const newerPostId = randomUUID();

    try {
      assert.equal(await readHomeTimelineCache({ profileId, limit: 10 }), null);
      assert.ok(
        await runRedisCommand((client) => client.zAdd(key, { score: -1, value: '__ready__' })),
      );
      assert.deepEqual(await readHomeTimelineCache({ profileId, limit: 10 }), {
        entries: [],
        oldestPostId: null,
        anchorPostId: null,
      });
      assert.ok(
        await runRedisCommand((client) =>
          client.zAdd(key, [
            { score: -1, value: '__ready__' },
            { score: 100, value: olderPostId },
            { score: 200, value: newerPostId },
          ]),
        ),
      );

      const defaultPage = await readHomeTimelineCache({ profileId, limit: 10 });
      assert.deepEqual(
        defaultPage?.entries.map(({ postId }) => postId),
        [newerPostId, olderPostId],
      );
      assert.equal(defaultPage?.oldestPostId, olderPostId);
      assert.deepEqual(
        (await readHomeTimelineCache({ profileId, after: 200, limit: 10 }))?.entries.map(
          ({ postId }) => postId,
        ),
        [olderPostId],
      );
      assert.deepEqual(
        (await readHomeTimelineCache({ profileId, before: 100, limit: 10 }))?.entries.map(
          ({ postId }) => postId,
        ),
        [newerPostId],
      );
      assert.deepEqual(
        (
          await readHomeTimelineCache({ profileId, after: 200, inverted: true, limit: 10 })
        )?.entries.map(({ postId }) => postId),
        [olderPostId],
      );
      assert.deepEqual(
        (
          await readHomeTimelineCache({
            profileId,
            before: 100,
            inverted: true,
            limit: 10,
          })
        )?.entries.map(({ postId }) => postId),
        [newerPostId],
      );
      assert.ok(
        await runRedisCommand((client) => client.zAdd(key, { score: 300, value: 'not-a-post-id' })),
      );
      assert.equal(await readHomeTimelineCache({ profileId, limit: 10 }), null);
      await runRedisCommand((client) => client.zRem(key, 'not-a-post-id'));

      const unavailableUrl = process.env.REDIS_URL;
      delete process.env.REDIS_URL;
      try {
        assert.equal(await readHomeTimelineCache({ profileId, limit: 10 }), null);
        await cacheHomeTimelinePage({ profileId, postIds: [] });
        await fanoutHomeTimelinePost({ postId: 'not-a-post-id' });
      } finally {
        if (unavailableUrl !== undefined) {
          process.env.REDIS_URL = unavailableUrl;
        }
      }
    } finally {
      await runRedisCommand((client) => client.unlink(key));
    }
  },
);

test(
  'Home page seeding preserves scores, repairs malformed entries, and stores supplied posts',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const first = await createPost({ profileId: viewer.id });
    const second = await createPost({ profileId: viewer.id });
    const key = `kosmo:home-timeline:profile:${viewer.id}`;

    const firstScore = 1_700_000_000_000;
    await runRedisCommand((client) =>
      client.zAdd(key, [
        { score: -1, value: '__ready__' },
        { score: firstScore, value: first.id },
        { score: firstScore + 1, value: 'not-a-post-id' },
      ]),
    );

    await cacheHomeTimelinePage({ profileId: viewer.id, postIds: [first.id, second.id] });

    const cache = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
    assert.deepEqual(
      cache?.entries.map(({ postId }) => postId).sort(),
      [first.id, second.id].sort(),
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, first.id)))?.value,
      firstScore,
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, 'not-a-post-id')))?.value,
      null,
    );
  },
);

test(
  'Home page append requires the current tail and cannot recreate an invalidated cache',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const [newest, tail, next, final, disjoint] = await Promise.all(
      Array.from({ length: 5 }, () => createPost({ profileId: viewer.id })),
    );
    assert.ok(newest && tail && next && final && disjoint);
    const key = `kosmo:home-timeline:profile:${viewer.id}`;

    await runRedisCommand((client) =>
      client.zAdd(key, [
        { score: -1, value: '__ready__' },
        { score: 200, value: newest.id },
        { score: 100, value: tail.id },
      ]),
    );

    await cacheHomeTimelinePage({
      profileId: viewer.id,
      after: newest.id,
      postIds: [tail.id, next.id],
    });
    assert.equal((await runRedisCommand((client) => client.zScore(key, newest.id)))?.value, 200);
    assert.equal((await runRedisCommand((client) => client.zScore(key, tail.id)))?.value, 100);
    assert.equal((await runRedisCommand((client) => client.zScore(key, next.id)))?.value, 100);
    const currentTail = (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))
      ?.oldestPostId;
    assert.ok(currentTail);
    await cacheHomeTimelinePage({ profileId: viewer.id, after: currentTail, postIds: [final.id] });
    await cacheHomeTimelinePage({
      profileId: viewer.id,
      after: '00000000-0000-7000-8000-000000000001',
      postIds: [disjoint.id],
    });

    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))?.entries
        .map(({ postId }) => postId)
        .sort(),
      [newest.id, tail.id, next.id, final.id].sort(),
    );
    assert.equal((await runRedisCommand((client) => client.zScore(key, disjoint.id)))?.value, null);

    await invalidateHomeTimelines({ profileIds: [viewer.id] });
    await cacheHomeTimelinePage({ profileId: viewer.id, after: tail.id, postIds: [disjoint.id] });
    assert.equal(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), null);
  },
);

test(
  'Home page seeding and append preserve the 1,000-post cap and renew the seven-day expiry',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const profileId = randomUUID();
    profileIds.push(profileId);
    const key = `kosmo:home-timeline:profile:${profileId}`;
    const idPrefix = randomUUID().slice(0, 24);
    const postIds = Array.from(
      { length: 1_001 },
      (_, index) => `${idPrefix}${(index + 1).toString(16).padStart(12, '0')}`,
    ).reverse();

    await cacheHomeTimelinePage({ profileId, postIds });

    assert.equal((await runRedisCommand((client) => client.zCard(key)))?.value, 1_001);
    assert.equal((await runRedisCommand((client) => client.zScore(key, '__ready__')))?.value, -1);
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, postIds.at(-1)!)))?.value,
      null,
    );
    const seeded = await readHomeTimelineCache({ profileId, limit: 1 });
    assert.ok(seeded?.oldestPostId);
    const appendedPostId = `${idPrefix}000000000000`;
    await runRedisCommand((client) => client.expire(key, 60));
    await cacheHomeTimelinePage({
      profileId,
      after: seeded.oldestPostId,
      postIds: [appendedPostId],
    });
    assert.equal((await runRedisCommand((client) => client.zCard(key)))?.value, 1_001);
    const ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);
  },
);

test(
  'Home cache distinguishes missing from empty, preserves fanout retries, and stays missing after eviction',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const secondViewer = await createProfile();
    const author = await createProfile();

    assert.equal(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), null);
    await cacheHomeTimelinePage({ profileId: viewer.id, postIds: [] });
    assert.deepEqual(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), {
      entries: [],
      oldestPostId: null,
      anchorPostId: null,
    });

    await db.insert(ProfileFollows).values([
      { followerProfileId: viewer.id, followeeProfileId: author.id },
      { followerProfileId: secondViewer.id, followeeProfileId: author.id },
    ]);
    const post = await createPost({ profileId: author.id });
    await fanoutHomeTimelinePost({ postId: post.id });

    const firstWrite = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
    assert.ok(firstWrite);
    assert.deepEqual(
      firstWrite.entries.map(({ postId }) => postId),
      [post.id],
    );
    assert.equal(firstWrite.oldestPostId, post.id);
    assert.equal(firstWrite.anchorPostId, post.id);

    await fanoutHomeTimelinePost({ postId: post.id });
    const retryWrite = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
    assert.equal(retryWrite?.entries[0]?.score, firstWrite.entries[0]?.score);
    assert.deepEqual(
      retryWrite?.entries.map(({ postId }) => postId),
      [post.id],
    );

    const secondPost = await createPost({ profileId: author.id });
    await fanoutHomeTimelinePost({ postId: secondPost.id });
    assert.ok(
      await runRedisCommand((client) =>
        client.zAdd(`kosmo:home-timeline:profile:${viewer.id}`, [
          { score: 100, value: post.id },
          { score: 200, value: secondPost.id },
        ]),
      ),
    );
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, after: 200, limit: 10 }))?.entries.map(
        ({ postId }) => postId,
      ),
      [post.id],
    );
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, before: 100, limit: 10 }))?.entries.map(
        ({ postId }) => postId,
      ),
      [secondPost.id],
    );
    assert.deepEqual(
      (
        await readHomeTimelineCache({ profileId: viewer.id, after: 200, inverted: true, limit: 10 })
      )?.entries.map(({ postId }) => postId),
      [post.id],
    );
    assert.deepEqual(
      (
        await readHomeTimelineCache({
          profileId: viewer.id,
          before: 100,
          inverted: true,
          limit: 10,
        })
      )?.entries.map(({ postId }) => postId),
      [secondPost.id],
    );

    assert.equal(await readHomeTimelineCache({ profileId: secondViewer.id, limit: 10 }), null);
    await cacheHomeTimelinePage({ profileId: secondViewer.id, postIds: [secondPost.id, post.id] });
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: secondViewer.id, limit: 10 }))?.entries
        .map(({ postId }) => postId)
        .sort(),
      [secondPost.id, post.id].sort(),
    );

    const unavailable = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      assert.equal(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), null);
    } finally {
      if (unavailable !== undefined) {
        process.env.REDIS_URL = unavailable;
      }
    }

    await runRedisCommand((client) => client.unlink(`kosmo:home-timeline:profile:${viewer.id}`));
    assert.equal(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), null);
    assert.equal(
      (await runRedisCommand((client) => client.exists(`kosmo:home-timeline:profile:${viewer.id}`)))
        ?.value,
      0,
    );

    await invalidateHomeTimelines({ profileIds: [viewer.id] });
    assert.equal(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), null);
    assert.ok(await readHomeTimelineCache({ profileId: secondViewer.id, limit: 10 }));
  },
);

test(
  'post fanout reaches reply-parent and follow candidates only when Home policy accepts them',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const parentOwner = await createProfile();
    const followsBoth = await createProfile();
    const followsReplyOnly = await createProfile();
    const replyAuthor = await createProfile();
    const parent = await createPost({ profileId: parentOwner.id });

    await db.insert(ProfileFollows).values([
      { followerProfileId: followsBoth.id, followeeProfileId: replyAuthor.id },
      { followerProfileId: followsBoth.id, followeeProfileId: parentOwner.id },
      { followerProfileId: followsReplyOnly.id, followeeProfileId: replyAuthor.id },
    ]);
    await Promise.all(
      [parentOwner, followsBoth, followsReplyOnly].map(({ id }) =>
        cacheHomeTimelinePage({ profileId: id, postIds: [] }),
      ),
    );
    const reply = await createPost({ profileId: replyAuthor.id, replyParentId: parent.id });
    await fanoutHomeTimelinePost({ postId: reply.id });

    const parentOwnerEntries = await readHomeTimelineCache({
      profileId: parentOwner.id,
      limit: 10,
    });
    const followsBothEntries = await readHomeTimelineCache({
      profileId: followsBoth.id,
      limit: 10,
    });
    const followsReplyOnlyEntries = await readHomeTimelineCache({
      profileId: followsReplyOnly.id,
      limit: 10,
    });
    assert.ok(parentOwnerEntries?.entries.some(({ postId }) => postId === reply.id));
    assert.ok(followsBothEntries?.entries.some(({ postId }) => postId === reply.id));
    assert.ok(!followsReplyOnlyEntries?.entries.some(({ postId }) => postId === reply.id));
  },
);
