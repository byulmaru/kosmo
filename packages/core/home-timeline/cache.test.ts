import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
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
  fanoutHomeTimelinePost,
  invalidateHomeTimelines,
  readHomeTimelineCache,
  rebuildHomeTimeline,
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
        await rebuildHomeTimeline({ profileId });
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
  'Home rebuilds share concurrent work and release failed attempts',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const profileId = randomUUID();
    profileIds.push(profileId);

    const firstRebuild = rebuildHomeTimeline({ profileId });
    const secondRebuild = rebuildHomeTimeline({ profileId });
    assert.equal(firstRebuild, secondRebuild);
    await Promise.all([firstRebuild, secondRebuild]);
    assert.deepEqual(await readHomeTimelineCache({ profileId, limit: 10 }), {
      entries: [],
      oldestPostId: null,
      anchorPostId: null,
    });

    const invalidProfileId = `not-a-profile-id:${randomUUID()}`;
    try {
      const failedRebuild = rebuildHomeTimeline({ profileId: invalidProfileId });
      await assert.rejects(failedRebuild);
      const retry = rebuildHomeTimeline({ profileId: invalidProfileId });
      assert.notEqual(retry, failedRebuild);
      await assert.rejects(retry);
      assert.equal(await readHomeTimelineCache({ profileId: invalidProfileId, limit: 10 }), null);
    } finally {
      await invalidateHomeTimelines({ profileIds: [invalidProfileId] });
    }
  },
);

test(
  'Home cache distinguishes missing and built-empty feeds, retries without reordering, and rebuilds after eviction',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const secondViewer = await createProfile();
    const author = await createProfile();

    assert.equal(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), null);
    await rebuildHomeTimeline({ profileId: viewer.id });
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
    await rebuildHomeTimeline({ profileId: secondViewer.id });
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: secondViewer.id, limit: 10 }))?.entries.map(
        ({ postId }) => postId,
      ),
      [secondPost.id, post.id],
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
    await rebuildHomeTimeline({ profileId: viewer.id });
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))?.entries.map(
        ({ postId }) => postId,
      ),
      [secondPost.id, post.id],
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
        rebuildHomeTimeline({ profileId: id }),
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
