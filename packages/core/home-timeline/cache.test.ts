import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  NaturalLanguageMuteRules,
  pg,
  PostContents,
  Posts,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { runRedisCommand } from '../redis/client';
import { disposeRedisPubSub } from '../redis/pubsub';
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
const naturalLanguageMuteDecisionKeys: string[] = [];

after(async () => {
  disposeRedisPubSub();
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
  if (naturalLanguageMuteDecisionKeys.length > 0) {
    await runRedisCommand((client) => client.unlink(naturalLanguageMuteDecisionKeys));
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
  bodyText = 'home cache post',
}: {
  readonly profileId: string;
  readonly replyParentId?: string;
  readonly bodyText?: string;
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
    .values({ postId: post.id, document: postContentDocumentFromText(bodyText) })
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

    const post = await createPost({ profileId });
    await cacheHomeTimelinePage({ profileId, postIds: [post.id] });
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
  'recipient pages advance through every structural candidate regardless of cache state',
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
    const first = await listHomeTimelineRecipientPage({ postId: post.id });
    assert.deepEqual(first, {
      profileIds: sortedCandidates.slice(0, 100).map(({ id }) => id),
      nextCursor: sortedCandidates[99]!.id,
    });

    const second = await listHomeTimelineRecipientPage({
      postId: post.id,
      afterProfileId: first.nextCursor!,
    });
    assert.deepEqual(second, {
      profileIds: [sortedCandidates[100]!.id],
      nextCursor: null,
    });

    const customFirst = await listHomeTimelineRecipientPage({ postId: post.id, limit: 2 });
    assert.deepEqual(customFirst, {
      profileIds: sortedCandidates.slice(0, 2).map(({ id }) => id),
      nextCursor: sortedCandidates[1]!.id,
    });
    const customSecond = await listHomeTimelineRecipientPage({
      postId: post.id,
      afterProfileId: customFirst.nextCursor!,
      limit: 2,
    });
    assert.deepEqual(customSecond, {
      profileIds: sortedCandidates.slice(2, 4).map(({ id }) => id),
      nextCursor: sortedCandidates[3]!.id,
    });
    assert.deepEqual(await listHomeTimelineRecipientPage({ postId: post.id, limit: 1_000 }), {
      profileIds: sortedCandidates.map(({ id }) => id),
      nextCursor: null,
    });
  },
);

test(
  'per-recipient insertion creates cold caches, preserves retry score and TTL, and rechecks Home policy',
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
    const post = await createPost({ profileId: author.id });
    const viewerKey = `kosmo:home-timeline:profile:${viewer.id}`;
    const recheckKey = `kosmo:home-timeline:profile:${recheckViewer.id}`;

    await insertHomeTimelinePost({ postId: post.id, profileId: viewer.id });
    const firstScore = (await runRedisCommand((client) => client.zScore(viewerKey, post.id)))
      ?.value;
    assert.ok(firstScore !== null && firstScore !== undefined);
    let ttl = (await runRedisCommand((client) => client.ttl(viewerKey)))?.value;
    assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);

    await runRedisCommand((client) => client.expire(viewerKey, 60));
    await insertHomeTimelinePost({ postId: post.id, profileId: viewer.id });
    assert.equal(
      (await runRedisCommand((client) => client.zScore(viewerKey, post.id)))?.value,
      firstScore,
    );
    ttl = (await runRedisCommand((client) => client.ttl(viewerKey)))?.value;
    assert.ok(ttl !== undefined && ttl <= 60 && ttl > 50, `unexpected TTL ${ttl}`);

    const additionalPost = await createPost({ profileId: author.id });
    await insertHomeTimelinePost({ postId: additionalPost.id, profileId: viewer.id });
    const additionalScore = (
      await runRedisCommand((client) => client.zScore(viewerKey, additionalPost.id))
    )?.value;
    assert.ok(Number.isFinite(additionalScore));
    assert.equal(
      (await runRedisCommand((client) => client.zScore(viewerKey, post.id)))?.value,
      firstScore,
    );
    ttl = (await runRedisCommand((client) => client.ttl(viewerKey)))?.value;
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
    assert.equal((await runRedisCommand((client) => client.exists(recheckKey)))?.value, 0);

    const inactiveViewer = await createProfile();
    const inactiveKey = `kosmo:home-timeline:profile:${inactiveViewer.id}`;
    await insertHomeTimelinePost({ postId: post.id, profileId: inactiveViewer.id });
    assert.equal((await runRedisCommand((client) => client.exists(inactiveKey)))?.value, 0);
  },
);

test(
  'per-recipient insertion filters each viewer independently and preserves cached membership',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const excludedViewer = await createProfile();
    const includedViewer = await createProfile();
    const cachedViewer = await createProfile();
    const unavailableViewer = await createProfile();
    const quoteAuthor = await createProfile();
    const sourceAuthor = await createProfile();
    const source = await createPost({
      profileId: sourceAuthor.id,
      bodyText: 'private quoted source text',
    });
    await db
      .update(Posts)
      .set({ visibility: PostVisibility.FOLLOWERS })
      .where(eq(Posts.id, source.id));
    const quote = await createPost({
      profileId: quoteAuthor.id,
      bodyText: 'outer quoted post',
    });
    await db
      .update(Posts)
      .set({
        repostSourceId: source.id,
        quoteConsentStatus: PostQuoteConsentStatus.APPROVED,
      })
      .where(eq(Posts.id, quote.id));

    await db.insert(ProfileFollows).values([
      { followerProfileId: excludedViewer.id, followeeProfileId: quoteAuthor.id },
      { followerProfileId: includedViewer.id, followeeProfileId: quoteAuthor.id },
      { followerProfileId: cachedViewer.id, followeeProfileId: quoteAuthor.id },
      { followerProfileId: unavailableViewer.id, followeeProfileId: quoteAuthor.id },
      { followerProfileId: excludedViewer.id, followeeProfileId: sourceAuthor.id },
    ]);
    await db.insert(NaturalLanguageMuteRules).values([
      { ownerProfileId: excludedViewer.id, condition: 'exclude this post' },
      { ownerProfileId: includedViewer.id, condition: 'include this post' },
      { ownerProfileId: cachedViewer.id, condition: 'cached viewer must not be classified' },
      { ownerProfileId: unavailableViewer.id, condition: 'provider unavailable' },
    ]);

    const cachedKey = `kosmo:home-timeline:profile:${cachedViewer.id}`;
    await runRedisCommand((client) => client.zAdd(cachedKey, { score: 123, value: quote.id }));
    await runRedisCommand((client) => client.expire(cachedKey, 60));
    const cachedTtlBefore = (await runRedisCommand((client) => client.ttl(cachedKey)))?.value;
    assert.ok(cachedTtlBefore !== undefined && cachedTtlBefore <= 60 && cachedTtlBefore > 50);

    naturalLanguageMuteDecisionKeys.push(
      ...[excludedViewer, includedViewer, cachedViewer, unavailableViewer].map(
        ({ id }) => `kosmo:home-timeline:natural-language-mute:profile:${id}`,
      ),
    );

    const previousApiKey = process.env.OPENAI_API_KEY;
    const previousFetch = globalThis.fetch;
    const requests: {
      readonly condition: string;
      readonly posts: { readonly role: string; readonly bodyText: string }[];
    }[] = [];
    process.env.OPENAI_API_KEY = 'test-openai-key';
    globalThis.fetch = async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as {
        readonly input: readonly {
          readonly content: readonly { readonly type: string; readonly text?: string }[];
        }[];
        readonly questions: readonly {
          readonly instructions: readonly { readonly type: string; readonly text?: string }[];
        }[];
      };
      const conditionPrefix = 'User-defined mute condition to evaluate (JSON string): ';
      const conditionInstruction = payload.questions[0]?.instructions.find(({ text }) =>
        text?.startsWith(conditionPrefix),
      );
      assert.ok(conditionInstruction?.text);
      const condition = JSON.parse(
        conditionInstruction.text.slice(conditionPrefix.length),
      ) as string;
      const posts = payload.input.flatMap(({ content }) =>
        content
          .filter(({ type, text }) => type === 'input_text' && text !== undefined)
          .map(({ text }) => JSON.parse(text!) as { role: string; bodyText: string }),
      );
      requests.push({ condition, posts });

      if (condition === 'provider unavailable') {
        return new Response('{}', { status: 503 });
      }
      const probability = condition === 'exclude this post' ? 0.95 : 0.2;
      return new Response(
        JSON.stringify({
          answers: [{ type: 'predicate', name: 'matches_mute_condition', probability }],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    };

    try {
      await Promise.all(
        [excludedViewer.id, includedViewer.id, cachedViewer.id, unavailableViewer.id].map(
          (profileId) => insertHomeTimelinePost({ postId: quote.id, profileId }),
        ),
      );

      const excludedKey = `kosmo:home-timeline:profile:${excludedViewer.id}`;
      const includedKey = `kosmo:home-timeline:profile:${includedViewer.id}`;
      const unavailableKey = `kosmo:home-timeline:profile:${unavailableViewer.id}`;
      assert.equal(
        (await runRedisCommand((client) => client.zScore(excludedKey, quote.id)))?.value,
        null,
      );
      assert.ok(
        Number.isFinite(
          (await runRedisCommand((client) => client.zScore(includedKey, quote.id)))?.value,
        ),
      );
      assert.ok(
        Number.isFinite(
          (await runRedisCommand((client) => client.zScore(unavailableKey, quote.id)))?.value,
        ),
      );
      assert.equal(
        (await runRedisCommand((client) => client.zScore(cachedKey, quote.id)))?.value,
        123,
      );
      const cachedTtlAfter = (await runRedisCommand((client) => client.ttl(cachedKey)))?.value;
      assert.ok(
        cachedTtlAfter !== undefined && cachedTtlAfter <= cachedTtlBefore && cachedTtlAfter > 50,
      );

      const requestsByCondition = new Map(requests.map((request) => [request.condition, request]));
      assert.equal(requests.length, 3);
      assert.equal(requestsByCondition.has('cached viewer must not be classified'), false);
      assert.equal(
        requestsByCondition
          .get('exclude this post')
          ?.posts.find(({ role }) => role === 'direct quote/source post')?.bodyText,
        'private quoted source text',
      );
      assert.equal(
        requestsByCondition
          .get('include this post')
          ?.posts.some(({ role }) => role === 'direct quote/source post'),
        false,
      );
      assert.equal(
        JSON.stringify(requestsByCondition.get('include this post')?.posts).includes(
          'private quoted source text',
        ),
        false,
      );
    } finally {
      globalThis.fetch = previousFetch;
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  },
);

test(
  'post removal pages tombstoned recipients, deletes emptied cold keys, and preserves TTL',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const author = await createProfile();
    const followers = await createProfiles(author.instanceId, 100);
    const parentOwner = await createProfile();
    const formerFollower = (await createProfiles(author.instanceId, 1))[0]!;
    const recipientProfiles = [author, ...followers, parentOwner];
    const missingCacheViewer = recipientProfiles[0]!;
    const targetOnlyViewer = followers[0]!;
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
          { score: 100, value: targetPost.id },
          ...(id === targetOnlyViewer.id ? [] : [{ score: 200, value: retainedPostId }]),
        ]);
        transaction.expire(keyFor(id), 400);
      }
      transaction.zAdd(formerFollowerKey, [
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
        transaction.ttl(key);
      }
      transaction.zScore(formerFollowerKey, targetPost.id);
      transaction.zScore(formerFollowerKey, retainedPostId);
      transaction.ttl(formerFollowerKey);
      return transaction.exec();
    });
    assert.ok(cacheState);
    const values = cacheState.value as unknown as (number | null)[];
    for (const [index, { id }] of recipientProfiles.entries()) {
      const offset = index * 3;
      assert.equal(values[offset], null);
      if (id === missingCacheViewer.id || id === targetOnlyViewer.id) {
        assert.equal(values[offset + 1], null);
        assert.equal(values[offset + 2], -2);
        continue;
      }
      assert.equal(values[offset + 1], 200);
      const ttl = values[offset + 2];
      assert.ok(ttl !== null && ttl <= 400 && ttl > 390, `unexpected TTL ${ttl}`);
    }
    const formerFollowerOffset = recipientProfiles.length * 3;
    assert.equal(values[formerFollowerOffset], 100);
    assert.equal(values[formerFollowerOffset + 1], 200);
    const formerFollowerTtl = values[formerFollowerOffset + 2];
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
  'follow reconciliation orders backfilled posts by stored time across cache pages',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const author = await createProfile();
    const historicalPosts = await Promise.all(
      Array.from({ length: 25 }, () => createPost({ profileId: author.id })),
    );
    const recentPost = await createPost({ profileId: viewer.id });
    const historicalCreatedAts = [...historicalPosts]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((post, index) => ({
        id: post.id,
        createdAt: recentPost.createdAt.subtract({ hours: 1, seconds: index }),
      }));
    await Promise.all(
      historicalCreatedAts.map(({ id, createdAt }) =>
        db.update(Posts).set({ createdAt }).where(eq(Posts.id, id)),
      ),
    );
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.id,
      followeeProfileId: author.id,
    });

    const key = `kosmo:home-timeline:profile:${viewer.id}`;
    await cacheHomeTimelinePage({ profileId: viewer.id, postIds: [recentPost.id] });
    const recentScore = (await runRedisCommand((client) => client.zScore(key, recentPost.id)))
      ?.value;
    assert.ok(Number.isFinite(recentScore));

    await reconcileHomeTimelineFollow({ profileId: viewer.id });
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, recentPost.id)))?.value,
      recentScore,
    );

    const expectedPostIds = [recentPost.id, ...historicalCreatedAts.map(({ id }) => id)];
    const firstPage = await readHomeTimelineCache({ profileId: viewer.id, limit: 20 });
    assert.ok(firstPage);
    assert.deepEqual(
      firstPage.entries.map(({ postId }) => postId),
      expectedPostIds.slice(0, 20),
    );
    const cursor = firstPage.entries.at(-1)?.score;
    assert.ok(cursor !== undefined);
    const secondPage = await readHomeTimelineCache({
      profileId: viewer.id,
      after: cursor,
      limit: 20,
    });
    assert.ok(secondPage);
    assert.deepEqual(
      secondPage.entries.map(({ postId }) => postId),
      expectedPostIds.slice(20),
    );

    for (const { id, createdAt } of historicalCreatedAts) {
      const score = (await runRedisCommand((client) => client.zScore(key, id)))?.value;
      assert.equal(score, createdAt.epochMilliseconds);
    }

    await reconcileHomeTimelineFollow({ profileId: viewer.id });

    for (const { id, createdAt } of historicalCreatedAts) {
      assert.equal(
        (await runRedisCommand((client) => client.zScore(key, id)))?.value,
        createdAt.epochMilliseconds,
      );
    }
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, recentPost.id)))?.value,
      recentScore,
    );
  },
);

test(
  'follow reconciliation preserves the remaining TTL when replacing the last cached post',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const previousAuthor = await createProfile();
    const currentAuthor = await createProfile();
    const previousPost = await createPost({ profileId: previousAuthor.id });
    const currentPost = await createPost({ profileId: currentAuthor.id });
    const key = `kosmo:home-timeline:profile:${viewer.id}`;

    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.id,
      followeeProfileId: previousAuthor.id,
    });
    await cacheHomeTimelinePage({ profileId: viewer.id, postIds: [previousPost.id] });
    await runRedisCommand((client) => client.expire(key, 60));

    await db
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, viewer.id),
          eq(ProfileFollows.followeeProfileId, previousAuthor.id),
        ),
      );
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.id,
      followeeProfileId: currentAuthor.id,
    });

    await reconcileHomeTimelineFollow({ profileId: viewer.id });

    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, previousPost.id)))?.value,
      null,
    );
    const currentScore = (await runRedisCommand((client) => client.zScore(key, currentPost.id)))
      ?.value;
    assert.ok(Number.isFinite(currentScore));
    const ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl <= 60 && ttl > 50, `unexpected TTL ${ttl}`);
  },
);

test(
  'Home cache misses on empty or missing keys and preserves anchors for empty cursor ranges',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const profileId = randomUUID();
    const key = `kosmo:home-timeline:profile:${profileId}`;
    const olderPostId = randomUUID();
    const newerPostId = randomUUID();

    try {
      assert.equal(await readHomeTimelineCache({ profileId, limit: 10 }), null);
      await cacheHomeTimelinePage({ profileId, postIds: [] });
      assert.equal(await readHomeTimelineCache({ profileId, limit: 10 }), null);
      assert.equal((await runRedisCommand((client) => client.exists(key)))?.value, 0);

      assert.ok(
        await runRedisCommand((client) => client.zAdd(key, { score: -1, value: '__ready__' })),
      );
      assert.equal(await readHomeTimelineCache({ profileId, limit: 10 }), null);
      assert.equal((await runRedisCommand((client) => client.exists(key)))?.value, 0);

      assert.ok(
        await runRedisCommand((client) =>
          client.zAdd(key, [
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
      assert.deepEqual(await readHomeTimelineCache({ profileId, after: 100, limit: 10 }), {
        entries: [],
        oldestPostId: olderPostId,
        anchorPostId: olderPostId,
      });
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
  'Home page head merge preserves fanout-only entries and their scores',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const first = await createPost({ profileId: viewer.id });
    const second = await createPost({ profileId: viewer.id });
    const fanoutOnly = await createPost({ profileId: viewer.id });
    const key = `kosmo:home-timeline:profile:${viewer.id}`;

    await fanoutHomeTimelinePost({ postId: first.id });
    const firstScore = (await runRedisCommand((client) => client.zScore(key, first.id)))?.value;
    assert.ok(Number.isFinite(firstScore));
    await fanoutHomeTimelinePost({ postId: fanoutOnly.id });
    const fanoutOnlyScore = (await runRedisCommand((client) => client.zScore(key, fanoutOnly.id)))
      ?.value;
    assert.ok(Number.isFinite(fanoutOnlyScore));

    await cacheHomeTimelinePage({ profileId: viewer.id, postIds: [first.id, second.id] });

    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, first.id)))?.value,
      firstScore,
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, fanoutOnly.id)))?.value,
      fanoutOnlyScore,
    );
    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))?.entries
        .map(({ postId }) => postId)
        .sort(),
      [first.id, second.id, fanoutOnly.id].sort(),
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
    assert.equal((await runRedisCommand((client) => client.zScore(key, next.id)))?.value, 99);
    const currentTail = (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))
      ?.oldestPostId;
    assert.equal(currentTail, next.id);
    await cacheHomeTimelinePage({ profileId: viewer.id, after: next.id, postIds: [final.id] });
    assert.equal((await runRedisCommand((client) => client.zScore(key, final.id)))?.value, 98);
    await cacheHomeTimelinePage({
      profileId: viewer.id,
      after: '00000000-0000-7000-8000-000000000001',
      postIds: [disjoint.id],
    });

    assert.deepEqual(
      (await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }))?.entries.map(
        ({ postId }) => postId,
      ),
      [newest.id, tail.id, next.id, final.id],
    );
    assert.equal((await runRedisCommand((client) => client.zScore(key, disjoint.id)))?.value, null);

    await invalidateHomeTimelines({ profileIds: [viewer.id] });
    await cacheHomeTimelinePage({ profileId: viewer.id, after: tail.id, postIds: [disjoint.id] });
    assert.equal(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), null);
  },
);

test(
  'Home page seeding and append cap actual posts at 1,000 and renew the seven-day expiry',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const profileId = randomUUID();
    profileIds.push(profileId);
    const key = `kosmo:home-timeline:profile:${profileId}`;
    const idPrefix = randomUUID().slice(0, 24);
    const postIds = Array.from(
      { length: 1_000 },
      (_, index) => `${idPrefix}${(index + 1).toString(16).padStart(12, '0')}`,
    ).reverse();

    await cacheHomeTimelinePage({ profileId, postIds });

    assert.equal((await runRedisCommand((client) => client.zCard(key)))?.value, 1_000);
    assert.equal((await runRedisCommand((client) => client.zScore(key, '__ready__')))?.value, null);
    const seeded = await readHomeTimelineCache({ profileId, limit: 1 });
    const tailId = seeded?.oldestPostId;
    assert.ok(tailId);
    assert.equal(tailId, postIds.at(-1));
    const tailScore = (await runRedisCommand((client) => client.zScore(key, tailId)))?.value;
    assert.ok(Number.isFinite(tailScore));
    const appendedPostId = `${idPrefix}000000000000`;
    await runRedisCommand((client) => client.expire(key, 60));
    await cacheHomeTimelinePage({
      profileId,
      after: tailId,
      postIds: [appendedPostId],
    });
    assert.equal((await runRedisCommand((client) => client.zCard(key)))?.value, 1_000);
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, appendedPostId)))?.value,
      null,
    );
    assert.equal((await runRedisCommand((client) => client.zScore(key, tailId)))?.value, tailScore);
    const ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);
  },
);

test(
  'Home fanout creates cold keys and preserves retry scores and TTL',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const secondViewer = await createProfile();
    const author = await createProfile();

    assert.equal(await readHomeTimelineCache({ profileId: viewer.id, limit: 10 }), null);
    const viewerKey = `kosmo:home-timeline:profile:${viewer.id}`;

    await db.insert(ProfileFollows).values([
      { followerProfileId: viewer.id, followeeProfileId: author.id },
      { followerProfileId: secondViewer.id, followeeProfileId: author.id },
    ]);
    const post = await createPost({ profileId: author.id });
    await fanoutHomeTimelinePost({ postId: post.id });

    let ttl = (await runRedisCommand((client) => client.ttl(viewerKey)))?.value;
    assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);
    const firstWrite = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
    assert.ok(firstWrite);
    assert.deepEqual(
      firstWrite.entries.map(({ postId }) => postId),
      [post.id],
    );
    assert.equal(firstWrite.oldestPostId, post.id);
    assert.equal(firstWrite.anchorPostId, post.id);
    const secondWrite = await readHomeTimelineCache({ profileId: secondViewer.id, limit: 10 });
    assert.deepEqual(
      secondWrite?.entries.map(({ postId }) => postId),
      [post.id],
    );

    await runRedisCommand((client) => client.expire(viewerKey, 60));
    const firstScore = firstWrite.entries[0]?.score;
    assert.ok(firstScore !== undefined);

    await fanoutHomeTimelinePost({ postId: post.id });
    assert.equal(
      (await runRedisCommand((client) => client.zScore(viewerKey, post.id)))?.value,
      firstScore,
    );
    ttl = (await runRedisCommand((client) => client.ttl(viewerKey)))?.value;
    assert.ok(ttl !== undefined && ttl <= 60 && ttl > 50, `unexpected TTL ${ttl}`);
    const retryWrite = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
    assert.equal(retryWrite?.entries[0]?.score, firstScore);
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
