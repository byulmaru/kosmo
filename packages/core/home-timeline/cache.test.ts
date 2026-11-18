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
  PostMentions,
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
import { queryHomeTimeline } from './query';

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

const createOrderedPostIdSequence = () => {
  const timestamp = randomUUID().replaceAll('-', '').slice(0, 12);
  const prefix = `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7000-8000-`;
  let sequence = 0;
  return () => `${prefix}${(++sequence).toString(16).padStart(12, '0')}`;
};

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
  id,
  replyParentId,
  bodyText = 'home cache post',
  mentions = [],
  visibility = PostVisibility.PUBLIC,
}: {
  readonly profileId: string;
  readonly id?: string;
  readonly replyParentId?: string;
  readonly bodyText?: string;
  readonly mentions?: readonly string[];
  readonly visibility?: PostVisibility;
}) => {
  const post = await db
    .insert(Posts)
    .values({
      ...(id === undefined ? {} : { id }),
      profileId,
      replyParentId,
      state: PostState.ACTIVE,
      visibility,
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
  if (mentions.length > 0) {
    await db.insert(PostMentions).values(
      mentions.map((mentionedProfileId) => ({
        postContentId: content.id,
        profileId: mentionedProfileId,
      })),
    );
  }
  return post;
};

const createPureRepost = async ({
  id,
  profileId,
  repostSourceId,
}: {
  readonly id?: string;
  readonly profileId: string;
  readonly repostSourceId: string;
}) => {
  const post = await db
    .insert(Posts)
    .values({
      ...(id === undefined ? {} : { id }),
      profileId,
      repostSourceId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  postIds.push(post.id);
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
  'follow reconciliation adds target-related posts only inside the closed cached ID window',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const target = await createProfile();
    const replyAuthor = await createProfile();
    const mentionParentAuthor = await createProfile();
    const unrelatedAuthor = await createProfile();
    const nextPostId = createOrderedPostIdSequence();
    const outsideBefore = await createPost({ profileId: target.id, id: nextPostId() });
    const lowerAnchor = await createPost({ profileId: viewer.id, id: nextPostId() });
    const targetPost = await createPost({ profileId: target.id, id: nextPostId() });
    const mentionParent = await createPost({
      profileId: mentionParentAuthor.id,
      id: nextPostId(),
    });
    const replyToTarget = await createPost({
      profileId: replyAuthor.id,
      id: nextPostId(),
      replyParentId: targetPost.id,
    });
    const replyMentioningTarget = await createPost({
      profileId: replyAuthor.id,
      id: nextPostId(),
      replyParentId: mentionParent.id,
      mentions: [target.id],
    });
    const repostOfTarget = await createPureRepost({
      id: nextPostId(),
      profileId: viewer.id,
      repostSourceId: targetPost.id,
    });
    const unrelatedPost = await createPost({
      profileId: unrelatedAuthor.id,
      id: nextPostId(),
    });
    const upperAnchor = await createPost({ profileId: viewer.id, id: nextPostId() });
    const outsideAfter = await createPost({ profileId: target.id, id: nextPostId() });
    const targetPostCreatedAt = lowerAnchor.createdAt.subtract({ hours: 1 });

    await Promise.all([
      db
        .update(Posts)
        .set({ createdAt: lowerAnchor.createdAt.add({ hours: 1 }) })
        .where(eq(Posts.id, outsideBefore.id)),
      db.update(Posts).set({ createdAt: targetPostCreatedAt }).where(eq(Posts.id, targetPost.id)),
      db
        .update(Posts)
        .set({ createdAt: lowerAnchor.createdAt.add({ hours: 2 }) })
        .where(eq(Posts.id, upperAnchor.id)),
      db
        .update(Posts)
        .set({ createdAt: lowerAnchor.createdAt.add({ hours: 1 }) })
        .where(eq(Posts.id, outsideAfter.id)),
    ]);
    await db.insert(ProfileFollows).values([
      { followerProfileId: viewer.id, followeeProfileId: target.id },
      { followerProfileId: viewer.id, followeeProfileId: replyAuthor.id },
      { followerProfileId: viewer.id, followeeProfileId: mentionParentAuthor.id },
      { followerProfileId: viewer.id, followeeProfileId: unrelatedAuthor.id },
    ]);

    const key = 'kosmo:home-timeline:profile:' + viewer.id;
    await cacheHomeTimelinePage({
      profileId: viewer.id,
      postIds: [lowerAnchor.id, upperAnchor.id],
    });
    const initialScores = new Map(
      await Promise.all(
        [lowerAnchor, upperAnchor].map(
          async ({ id }) =>
            [id, (await runRedisCommand((client) => client.zScore(key, id)))?.value] as const,
        ),
      ),
    );
    const otherwiseEligibleUnrelatedPosts = await queryHomeTimeline({
      profileId: viewer.id,
      postIds: [outsideBefore.id, outsideAfter.id, unrelatedPost.id],
      limit: 3,
    });
    assert.deepEqual(
      new Set(otherwiseEligibleUnrelatedPosts.map(({ id }) => id)),
      new Set([outsideBefore.id, outsideAfter.id, unrelatedPost.id]),
    );

    await reconcileHomeTimelineFollow({
      profileId: viewer.id,
      followeeProfileIds: [target.id],
    });

    assert.equal((await runRedisCommand((client) => client.zCard(key)))?.value, 6);
    const addedPosts = [
      [targetPost.id, targetPostCreatedAt.epochMilliseconds],
      [replyToTarget.id, replyToTarget.createdAt.epochMilliseconds],
      [replyMentioningTarget.id, replyMentioningTarget.createdAt.epochMilliseconds],
      [repostOfTarget.id, repostOfTarget.createdAt.epochMilliseconds],
    ] as const;
    for (const [postId, expectedScore] of addedPosts) {
      assert.equal(
        (await runRedisCommand((client) => client.zScore(key, postId)))?.value,
        expectedScore,
      );
    }
    for (const post of [outsideBefore, outsideAfter, unrelatedPost]) {
      assert.equal((await runRedisCommand((client) => client.zScore(key, post.id)))?.value, null);
    }
    for (const [postId, score] of initialScores) {
      assert.ok(Number.isFinite(score));
      assert.equal((await runRedisCommand((client) => client.zScore(key, postId)))?.value, score);
    }

    const emptyViewer = await createProfile();
    const emptyKey = 'kosmo:home-timeline:profile:' + emptyViewer.id;
    await reconcileHomeTimelineFollow({
      profileId: emptyViewer.id,
      followeeProfileIds: [target.id],
    });
    assert.equal((await runRedisCommand((client) => client.exists(emptyKey)))?.value, 0);
  },
);

test(
  'follow reconciliation removes only affected ineligible posts and retains other Home paths',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const target = await createProfile();
    const replyAuthor = await createProfile();
    const mentionParentAuthor = await createProfile();
    const unrelatedAuthor = await createProfile();
    const outsider = await createProfile();
    const targetPost = await createPost({ profileId: target.id });
    const targetParent = await createPost({ profileId: target.id });
    const replyToTarget = await createPost({
      profileId: replyAuthor.id,
      replyParentId: targetParent.id,
    });
    const mentionParent = await createPost({ profileId: mentionParentAuthor.id });
    const replyMentioningTarget = await createPost({
      profileId: replyAuthor.id,
      replyParentId: mentionParent.id,
      mentions: [target.id],
    });
    const followersOnlySource = await createPost({
      profileId: target.id,
      visibility: PostVisibility.FOLLOWERS,
    });
    const followersOnlyRepost = await createPureRepost({
      profileId: viewer.id,
      repostSourceId: followersOnlySource.id,
    });
    const publicSource = await createPost({ profileId: target.id });
    const publicRepost = await createPureRepost({
      profileId: viewer.id,
      repostSourceId: publicSource.id,
    });
    const viewerPost = await createPost({ profileId: viewer.id });
    const replyToViewer = await createPost({
      profileId: outsider.id,
      replyParentId: viewerPost.id,
    });
    const unrelatedPost = await createPost({ profileId: unrelatedAuthor.id });
    const cachedPosts = [
      targetPost,
      targetParent,
      replyToTarget,
      mentionParent,
      replyMentioningTarget,
      followersOnlyRepost,
      publicRepost,
      viewerPost,
      replyToViewer,
      unrelatedPost,
    ];
    await db.insert(ProfileFollows).values([
      { followerProfileId: viewer.id, followeeProfileId: target.id },
      { followerProfileId: viewer.id, followeeProfileId: replyAuthor.id },
      { followerProfileId: viewer.id, followeeProfileId: mentionParentAuthor.id },
      { followerProfileId: viewer.id, followeeProfileId: unrelatedAuthor.id },
    ]);

    const cachedPostIds = cachedPosts.map(({ id }) => id);
    assert.deepEqual(
      new Set(
        (
          await queryHomeTimeline({
            profileId: viewer.id,
            postIds: cachedPostIds,
            limit: cachedPostIds.length,
          })
        ).map(({ id }) => id),
      ),
      new Set(cachedPostIds),
    );

    const key = 'kosmo:home-timeline:profile:' + viewer.id;
    await cacheHomeTimelinePage({ profileId: viewer.id, postIds: cachedPostIds });
    await runRedisCommand((client) => client.expire(key, 60));
    const initialScores = new Map(
      await Promise.all(
        cachedPosts.map(
          async ({ id }) =>
            [id, (await runRedisCommand((client) => client.zScore(key, id)))?.value] as const,
        ),
      ),
    );

    await db
      .delete(ProfileFollows)
      .where(
        and(
          eq(ProfileFollows.followerProfileId, viewer.id),
          inArray(ProfileFollows.followeeProfileId, [target.id, unrelatedAuthor.id]),
        ),
      );
    const currentlyEligible = await queryHomeTimeline({
      profileId: viewer.id,
      postIds: cachedPostIds,
      limit: cachedPostIds.length,
    });
    assert.equal(
      currentlyEligible.some(({ id }) => id === unrelatedPost.id),
      false,
    );
    await reconcileHomeTimelineFollow({
      profileId: viewer.id,
      followeeProfileIds: [target.id],
    });

    const removedPosts = [
      targetPost,
      targetParent,
      replyToTarget,
      replyMentioningTarget,
      followersOnlyRepost,
    ];
    const retainedPosts = [mentionParent, publicRepost, viewerPost, replyToViewer, unrelatedPost];
    assert.equal(
      (await runRedisCommand((client) => client.zCard(key)))?.value,
      retainedPosts.length,
    );
    for (const { id } of removedPosts) {
      assert.equal((await runRedisCommand((client) => client.zScore(key, id)))?.value, null);
    }
    for (const { id } of retainedPosts) {
      const score = (await runRedisCommand((client) => client.zScore(key, id)))?.value;
      assert.equal(score, initialScores.get(id));
      assert.ok(Number.isFinite(score));
    }
    const ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl <= 60 && ttl > 45, 'unexpected TTL ' + ttl);
  },
);

test(
  'follow reconciliation filters only new target posts and preserves concurrent cache state',
  { skip: !testRedisUrl },
  async () => {
    await waitForRedis();
    const viewer = await createProfile();
    const target = await createProfile();
    const nextPostId = createOrderedPostIdSequence();
    const pageFillPost = await createPost({ profileId: viewer.id, id: nextPostId() });
    const cachedExcludedPost = await createPost({
      profileId: target.id,
      id: nextPostId(),
      bodyText: 'exclude cached item',
    });
    const includedPost = await createPost({
      profileId: target.id,
      id: nextPostId(),
      bodyText: 'include new item',
    });
    const excludedPost = await createPost({
      profileId: target.id,
      id: nextPostId(),
      bodyText: 'exclude new item',
    });
    const upperAnchor = await createPost({ profileId: viewer.id, id: nextPostId() });
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.id,
      followeeProfileId: target.id,
    });
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.id,
      condition: 'exclude selected posts',
    });
    naturalLanguageMuteDecisionKeys.push(
      'kosmo:home-timeline:natural-language-mute:profile:' + viewer.id,
    );

    const key = 'kosmo:home-timeline:profile:' + viewer.id;
    await cacheHomeTimelinePage({
      profileId: viewer.id,
      postIds: [cachedExcludedPost.id, upperAnchor.id],
    });
    const initialCache = await readHomeTimelineCache({ profileId: viewer.id, limit: 10 });
    const tailPostId = initialCache?.oldestPostId;
    assert.ok(tailPostId);
    const initialScores = new Map(
      await Promise.all(
        [cachedExcludedPost, upperAnchor].map(
          async ({ id }) =>
            [id, (await runRedisCommand((client) => client.zScore(key, id)))?.value] as const,
        ),
      ),
    );

    const previousApiKey = process.env.OPENAI_API_KEY;
    const previousFetch = globalThis.fetch;
    let notifyFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      notifyFetchStarted = resolve;
    });
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const evaluatedBodies: string[] = [];
    process.env.OPENAI_API_KEY = 'test-openai-key';
    globalThis.fetch = async (_input, init) => {
      notifyFetchStarted();
      await fetchGate;
      const payload = JSON.parse(String(init?.body)) as {
        readonly input: readonly {
          readonly content: readonly { readonly type: string; readonly text?: string }[];
        }[];
      };
      const posts = payload.input.flatMap(({ content }) =>
        content
          .filter(({ type, text }) => type === 'input_text' && text !== undefined)
          .map(({ text }) => JSON.parse(text!) as { readonly bodyText: string }),
      );
      evaluatedBodies.push(...posts.map(({ bodyText }) => bodyText));
      const probability = posts.some(({ bodyText }) => bodyText.includes('exclude')) ? 0.95 : 0.2;
      return new Response(
        JSON.stringify({
          answers: [{ type: 'predicate', name: 'matches_mute_condition', probability }],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    };

    let pageFillScore: number | null | undefined;
    try {
      const reconciliation = reconcileHomeTimelineFollow({
        profileId: viewer.id,
        followeeProfileIds: [target.id],
      });
      await fetchStarted;
      await cacheHomeTimelinePage({
        profileId: viewer.id,
        after: tailPostId,
        postIds: [pageFillPost.id],
      });
      await runRedisCommand((client) => client.expire(key, 60));
      pageFillScore = (await runRedisCommand((client) => client.zScore(key, pageFillPost.id)))
        ?.value;
      assert.equal((await runRedisCommand((client) => client.zCard(key)))?.value, 3);
      releaseFetch();
      await reconciliation;
    } finally {
      releaseFetch();
      globalThis.fetch = previousFetch;
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }

    assert.deepEqual(evaluatedBodies.sort(), ['exclude new item', 'include new item']);
    assert.equal((await runRedisCommand((client) => client.zCard(key)))?.value, 4);
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, includedPost.id)))?.value,
      includedPost.createdAt.epochMilliseconds,
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, excludedPost.id)))?.value,
      null,
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, cachedExcludedPost.id)))?.value,
      initialScores.get(cachedExcludedPost.id),
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, upperAnchor.id)))?.value,
      initialScores.get(upperAnchor.id),
    );
    assert.equal(
      (await runRedisCommand((client) => client.zScore(key, pageFillPost.id)))?.value,
      pageFillScore,
    );
    assert.ok(Number.isFinite(pageFillScore));
    const ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
    assert.ok(ttl !== undefined && ttl <= 60 && ttl > 45, 'unexpected TTL ' + ttl);
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
