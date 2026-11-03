import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
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
import {
  invalidateHomeTimelines,
  readHomeTimelineCache,
  rebuildHomeTimeline,
} from '../home-timeline/cache';
import { postContentDocumentFromText } from '../post-content/server';
import { runRedisCommand } from '../redis/client';
import { disableProfile } from './profile';

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;
const previousRedisUrl = process.env.REDIS_URL;
if (testRedisUrl) {
  process.env.REDIS_URL = testRedisUrl;
}

const createdProfileIds: string[] = [];
const createdInstanceIds: string[] = [];
const createdPostIds: string[] = [];
const createdContentIds: string[] = [];

after(async () => {
  if (createdProfileIds.length > 0) {
    await invalidateHomeTimelines({ profileIds: createdProfileIds });
  }
  for (const postId of createdPostIds) {
    await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
  }
  for (const contentId of createdContentIds) {
    await db.update(PostContents).set({ postId: null }).where(eq(PostContents.id, contentId));
  }
  for (const postId of createdPostIds) {
    await db.delete(Posts).where(eq(Posts.id, postId));
  }
  for (const contentId of createdContentIds) {
    await db.delete(PostContents).where(eq(PostContents.id, contentId));
  }
  if (createdProfileIds.length > 0) {
    await db
      .delete(ProfileFollows)
      .where(inArray(ProfileFollows.followerProfileId, createdProfileIds));
    await db.delete(Profiles).where(inArray(Profiles.id, createdProfileIds));
  }
  if (createdInstanceIds.length > 0) {
    for (const instanceId of createdInstanceIds) {
      await db.delete(Instances).where(eq(Instances.id, instanceId));
    }
  }
  await pg.end();
  if (previousRedisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = previousRedisUrl;
  }
});

const createProfile = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  createdInstanceIds.push(instance.id);
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
  createdProfileIds.push(profile.id);
  return profile;
};

const createPost = async (profileId: string, text: string) => {
  const postContent = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText(text) })
    .returning()
    .then(firstOrThrow);
  createdContentIds.push(postContent.id);
  const post = await db
    .insert(Posts)
    .values({
      currentContentId: postContent.id,
      profileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  createdPostIds.push(post.id);
  await db.update(PostContents).set({ postId: post.id }).where(eq(PostContents.id, postContent.id));
  return post;
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

test(
  'Profile disable retains related and unrelated Home timeline cache members',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const author = await createProfile();
    const unrelatedViewer = await createProfile();
    const unrelatedAuthor = await createProfile();
    const post = await createPost(author.id, 'profile disable home timeline test');
    const unrelatedPost = await createPost(unrelatedAuthor.id, 'unrelated home timeline test');
    await db.insert(ProfileFollows).values([
      { followerProfileId: viewer.id, followeeProfileId: author.id },
      { followerProfileId: unrelatedViewer.id, followeeProfileId: unrelatedAuthor.id },
    ]);

    await Promise.all([
      rebuildHomeTimeline({ profileId: viewer.id }),
      rebuildHomeTimeline({ profileId: unrelatedViewer.id }),
    ]);
    const [relatedCache, unrelatedCache] = await Promise.all([
      readHomeTimelineCache({ profileId: viewer.id, limit: 10 }),
      readHomeTimelineCache({ profileId: unrelatedViewer.id, limit: 10 }),
    ]);
    assert.deepEqual(
      relatedCache?.entries.map(({ postId }) => postId),
      [post.id],
    );
    assert.deepEqual(
      unrelatedCache?.entries.map(({ postId }) => postId),
      [unrelatedPost.id],
    );

    await disableProfile(author.id);
    assert.equal(
      await db
        .select({ state: Profiles.state })
        .from(Profiles)
        .where(eq(Profiles.id, author.id))
        .then(firstOrThrow)
        .then(({ state }) => state),
      ProfileState.DISABLED,
    );
    assert.equal(
      await db
        .select({ state: Posts.state })
        .from(Posts)
        .where(eq(Posts.id, post.id))
        .then(firstOrThrow)
        .then(({ state }) => state),
      PostState.ACTIVE,
    );
    const [relatedCacheAfterDisable, unrelatedCacheAfterDisable] = await Promise.all([
      readHomeTimelineCache({ profileId: viewer.id, limit: 10 }),
      readHomeTimelineCache({ profileId: unrelatedViewer.id, limit: 10 }),
    ]);
    assert.deepEqual(
      relatedCacheAfterDisable?.entries.map(({ postId }) => postId),
      [post.id],
    );
    assert.deepEqual(
      unrelatedCacheAfterDisable?.entries.map(({ postId }) => postId),
      [unrelatedPost.id],
    );
  },
);
