import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
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
  invalidateHomeTimelines,
  readHomeTimelineCache,
  rebuildHomeTimeline,
} from '../home-timeline/cache';
import { disableProfile } from './profile';

const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;
const previousRedisUrl = process.env.REDIS_URL;
if (testRedisUrl) {
  process.env.REDIS_URL = testRedisUrl;
}

const createdProfileIds: string[] = [];
const createdInstanceIds: string[] = [];
let postId: string | undefined;
let contentId: string | undefined;

after(async () => {
  const [viewerProfileId, authorProfileId] = createdProfileIds;
  if (viewerProfileId) {
    await invalidateHomeTimelines({ profileIds: [viewerProfileId] });
  }
  if (postId) {
    await db.update(Posts).set({ currentContentId: null }).where(eq(Posts.id, postId));
  }
  if (contentId) {
    await db.update(PostContents).set({ postId: null }).where(eq(PostContents.id, contentId));
  }
  if (postId) {
    await db.delete(Posts).where(eq(Posts.id, postId));
  }
  if (contentId) {
    await db.delete(PostContents).where(eq(PostContents.id, contentId));
  }
  if (viewerProfileId && authorProfileId) {
    await db.delete(ProfileFollows).where(eq(ProfileFollows.followerProfileId, viewerProfileId));
  }
  if (createdProfileIds.length > 0) {
    await db.delete(Profiles).where(eq(Profiles.id, createdProfileIds[0]!));
    if (createdProfileIds[1]) {
      await db.delete(Profiles).where(eq(Profiles.id, createdProfileIds[1]!));
    }
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

test(
  'Profile disable invalidates affected Home lists and repeated disable preserves a rebuilt list',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const author = await createProfile();
    const postContent = await db
      .insert(PostContents)
      .values({ document: postContentDocumentFromText('profile disable home timeline test') })
      .returning()
      .then(firstOrThrow);
    contentId = postContent.id;
    const post = await db
      .insert(Posts)
      .values({
        currentContentId: postContent.id,
        profileId: author.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    postId = post.id;
    await db
      .update(PostContents)
      .set({ postId: post.id })
      .where(eq(PostContents.id, postContent.id));
    await db
      .insert(ProfileFollows)
      .values({ followerProfileId: viewer.id, followeeProfileId: author.id });

    await rebuildHomeTimeline({ profileId: viewer.id });
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))?.entries.map(
        ({ postId: cachedPostId }) => cachedPostId,
      ),
      [post.id],
    );

    await disableProfile(author.id);
    await waitForMissingHomeTimeline(viewer.id);
    await rebuildHomeTimeline({ profileId: viewer.id });
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))?.entries,
      [],
    );

    await disableProfile(author.id);
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))?.entries,
      [],
    );
  },
);
