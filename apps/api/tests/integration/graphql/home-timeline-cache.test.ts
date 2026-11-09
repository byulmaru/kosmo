import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import {
  postContentDocumentFromText,
  postContentDocumentFromTextAndMedia,
} from '@kosmo/core/post-content/server';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as HomeTimelineCache from '@kosmo/core/home-timeline/cache';
import type * as NaturalLanguageMuteCache from '@kosmo/core/home-timeline/natural-language-mute-cache';
import type * as CoreRedis from '../../../../../packages/core/redis/client';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;
const previousPublicOrigin = process.env.PUBLIC_ORIGIN;
if (testRedisUrl) {
  process.env.REDIS_URL = testRedisUrl;
}
process.env.DATABASE_URL = databaseUrl;

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let NaturalLanguageMuteRules: typeof CoreDb.NaturalLanguageMuteRules;
let pg: typeof CoreDb.pg;
let Posts: typeof CoreDb.Posts;
let PostContents: typeof CoreDb.PostContents;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileMutes: typeof CoreDb.ProfileMutes;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let cacheHomeTimelinePage: typeof HomeTimelineCache.cacheHomeTimelinePage;
let cacheNaturalLanguageMuteDecision: typeof NaturalLanguageMuteCache.cacheNaturalLanguageMuteDecision;
let fanoutHomeTimelinePost: typeof HomeTimelineCache.fanoutHomeTimelinePost;
let insertHomeTimelinePost: typeof HomeTimelineCache.insertHomeTimelinePost;
let reconcileHomeTimelineFollow: typeof HomeTimelineCache.reconcileHomeTimelineFollow;
let invalidateHomeTimelines: typeof HomeTimelineCache.invalidateHomeTimelines;
let removeHomeTimelinePost: typeof HomeTimelineCache.removeHomeTimelinePost;
let readHomeTimelineCache: typeof HomeTimelineCache.readHomeTimelineCache;
let runRedisCommand: typeof CoreRedis.runRedisCommand;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;
let configuredLocalInstanceId: string;
const fixtureProfileIds: string[] = [];
const fixtureAccountIds: string[] = [];
const fixturePostIds: string[] = [];
const fixtureContentIds: string[] = [];
const fixtureMediaIds: string[] = [];

type GraphQLResult<TData> = {
  readonly data?: TData | null;
  readonly errors?: readonly { readonly message: string }[];
};

type HomeConnection = {
  readonly edges: readonly {
    readonly cursor: string;
    readonly node: {
      readonly id: string;
      readonly smartFilterProbability?: number | null;
      readonly content: { readonly bodyText: string } | null;
      readonly repostSource?: {
        readonly id: string;
        readonly content: { readonly bodyText: string } | null;
      } | null;
    };
  }[];
  readonly pageInfo: {
    readonly startCursor?: string | null;
    readonly endCursor: string | null;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
  };
};

type SmartFilterResultConnection = {
  readonly edges: readonly {
    readonly cursor: string;
    readonly node: {
      readonly posts: readonly {
        readonly id: string;
        readonly smartFilterProbability: number | null;
      }[];
    };
  }[];
  readonly pageInfo: {
    readonly startCursor: string | null;
    readonly endCursor: string | null;
    readonly hasNextPage: boolean;
    readonly hasPreviousPage: boolean;
  };
};

type Auth = {
  readonly account: { readonly id: string };
  readonly profile: { readonly id: string };
  readonly session: { readonly id: string };
  readonly token: string;
};

type NaturalMuteRequest = {
  readonly input: readonly {
    readonly content: readonly {
      readonly image_url?: string;
      readonly type: string;
      readonly text?: string;
    }[];
  }[];
  readonly questions: readonly {
    readonly instructions: readonly { readonly text?: string }[];
  }[];
};

before(async () => {
  if (testRedisUrl) {
    process.env.REDIS_URL = testRedisUrl;
  }
  process.env.NODE_ENV = 'production';
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const configuredOrigin = `https://home-config-${suffix}.example`;
  process.env.PUBLIC_ORIGIN = configuredOrigin;
  process.env.ENVIRONMENT = 'test';

  ({
    AccountProfiles,
    Accounts,
    db,
    firstOrThrow,
    Instances,
    Media,
    NaturalLanguageMuteRules,
    pg,
    Posts,
    PostContents,
    ProfileBlocks,
    ProfileFollows,
    ProfileMutes,
    Profiles,
    Sessions,
  } = await import('@kosmo/core/db'));
  ({
    cacheHomeTimelinePage,
    fanoutHomeTimelinePost,
    insertHomeTimelinePost,
    reconcileHomeTimelineFollow,
    invalidateHomeTimelines,
    removeHomeTimelinePost,
    readHomeTimelineCache,
  } = await import('@kosmo/core/home-timeline/cache'));
  ({ cacheNaturalLanguageMuteDecision } =
    await import('@kosmo/core/home-timeline/natural-language-mute-cache'));
  ({ runRedisCommand } = await import('../../../../../packages/core/redis/client'));
  if (testRedisUrl) {
    await waitForRedis();
  }

  const configuredLocalInstance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: configuredOrigin,
      domain: new URL(configuredOrigin).host,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  configuredLocalInstanceId = configuredLocalInstance.id;

  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  const localInstance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://home-cache-${suffix}.example`,
      domain: `home-cache-${suffix}.example`,
      kind: InstanceKind.LOCAL,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  localInstanceId = localInstance.id;

  app = new Hono<Env>();
  app.use('*', async (context, next) => {
    context.set('context', await deriveContext(context));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  if (fixtureProfileIds.length > 0) {
    await db
      .update(Posts)
      .set({ currentContentId: null, repostSourceId: null })
      .where(inArray(Posts.profileId, fixtureProfileIds));
    await db.delete(ProfileBlocks).where(inArray(ProfileBlocks.ownerProfileId, fixtureProfileIds));
    await db.delete(ProfileMutes).where(inArray(ProfileMutes.ownerProfileId, fixtureProfileIds));
    await db
      .delete(ProfileFollows)
      .where(
        and(
          inArray(ProfileFollows.followerProfileId, fixtureProfileIds),
          inArray(ProfileFollows.followeeProfileId, fixtureProfileIds),
        ),
      );
    await db.delete(Sessions).where(inArray(Sessions.accountId, fixtureAccountIds));
    await db.delete(PostContents).where(inArray(PostContents.id, fixtureContentIds));
    await db.delete(Posts).where(inArray(Posts.id, fixturePostIds));
    await db.delete(Media).where(inArray(Media.id, fixtureMediaIds));
    await db
      .delete(NaturalLanguageMuteRules)
      .where(inArray(NaturalLanguageMuteRules.ownerProfileId, fixtureProfileIds));
    await db.delete(AccountProfiles).where(inArray(AccountProfiles.accountId, fixtureAccountIds));
    await db.delete(Accounts).where(inArray(Accounts.id, fixtureAccountIds));
    await db.delete(Profiles).where(inArray(Profiles.id, fixtureProfileIds));
  }
  if (localInstanceId) {
    await db.delete(Instances).where(eq(Instances.id, localInstanceId));
  }
  if (configuredLocalInstanceId) {
    await db.delete(Instances).where(eq(Instances.id, configuredLocalInstanceId));
  }
  await pg.end();
  if (previousPublicOrigin === undefined) {
    delete process.env.PUBLIC_ORIGIN;
  } else {
    process.env.PUBLIC_ORIGIN = previousPublicOrigin;
  }
});

test(
  'keeps a cached Home Post and body stale after Block while a direct Node read is denied in the same operation',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const author = await createProfile('cached-block-author');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: author.id,
    });
    const post = await createContentfulPost(
      author.id,
      'cached body after block',
      undefined,
      PostVisibility.FOLLOWERS,
    );
    await fanoutHomeTimelinePost({ postId: post.id });

    await db.insert(ProfileBlocks).values({
      ownerProfileId: viewer.profile.id,
      targetProfileId: author.id,
    });

    const result = await requestGraphQL<{
      homeTimeline: HomeConnection;
      directPost: { id: string } | null;
      directContent: { id: string } | null;
    }>(
      `query CachedHomeAndDirectNodes($postId: ID!, $contentId: ID!) {
        homeTimeline(first: 10) {
          edges { cursor node { id content { bodyText } } }
          pageInfo { endCursor hasNextPage hasPreviousPage }
        }
        directPost: node(id: $postId) { ... on Post { id } }
        directContent: node(id: $contentId) { ... on PostContent { id } }
      }`,
      {
        postId: encodeGlobalId('Post', post.id),
        contentId: encodeGlobalId('PostContent', post.contentId),
      },
      viewer.token,
    );

    assert.equal(result.errors, undefined, JSON.stringify(result.errors));
    assert.deepEqual(
      result.data?.homeTimeline.edges.map(({ node }) => [node.id, node.content?.bodyText]),
      [[encodeGlobalId('Post', post.id), 'cached body after block']],
    );
    assert.equal(result.data?.directPost, null);
    assert.equal(result.data?.directContent, null);
    assert.match(result.data!.homeTimeline.edges[0]!.cursor, /^redis:\d+$/);
  },
);

test(
  'keeps a cached Home Post and body stale after Profile Mute until the cache is rebuilt',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const author = await createProfile('cached-mute-author');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: author.id,
    });
    const post = await createContentfulPost(author.id, 'cached body after mute');
    await fanoutHomeTimelinePost({ postId: post.id });
    await db.insert(ProfileMutes).values({
      ownerProfileId: viewer.profile.id,
      targetProfileId: author.id,
    });

    const stale = await requestGraphQL<{ homeTimeline: HomeConnection }>(
      `query CachedHomeMute { homeTimeline(first: 10) { edges { node { id content { bodyText } } } pageInfo { endCursor hasNextPage hasPreviousPage } } }`,
      {},
      viewer.token,
    );
    assert.equal(stale.errors, undefined, JSON.stringify(stale.errors));
    assert.deepEqual(
      stale.data?.homeTimeline.edges.map(({ node }) => [node.id, node.content?.bodyText]),
      [[encodeGlobalId('Post', post.id), 'cached body after mute']],
    );

    await invalidateHomeTimelines({ profileIds: [viewer.profile.id] });
    const fresh = await requestGraphQL<{ homeTimeline: HomeConnection }>(
      `query RebuiltHomeMute { homeTimeline(first: 10) { edges { node { id } } pageInfo { endCursor hasNextPage hasPreviousPage } } }`,
      {},
      viewer.token,
    );
    assert.equal(fresh.errors, undefined, JSON.stringify(fresh.errors));
    assert.deepEqual(fresh.data?.homeTimeline.edges, []);
  },
);

test(
  'filters inactive Home authors and direct source authors from Redis and DB results',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const disabledOuterAuthor = await createProfile('home-disabled-outer-author');
    const suspendedOuterAuthor = await createProfile('home-suspended-outer-author');
    const disabledSourceAuthor = await createProfile('home-disabled-source-author');
    const suspendedSourceAuthor = await createProfile('home-suspended-source-author');
    const repostAuthor = await createProfile('home-active-repost-author');
    const quoteAuthor = await createProfile('home-active-quote-author');
    const activeSourceAuthor = await createProfile('home-active-source-author');
    const validAuthor = await createProfile('home-valid-author');
    await db.insert(ProfileFollows).values(
      [disabledOuterAuthor, suspendedOuterAuthor, repostAuthor, quoteAuthor, validAuthor].map(
        (profile) => ({
          followerProfileId: viewer.profile.id,
          followeeProfileId: profile.id,
        }),
      ),
    );
    const validPost = await createContentfulPost(validAuthor.id, 'active Home Post remains');
    const deletedSource = await createContentfulPost(
      activeSourceAuthor.id,
      'deleted source of active-author Quote',
    );
    const disabledSource = await createContentfulPost(
      disabledSourceAuthor.id,
      'disabled source author',
    );
    const suspendedSource = await createContentfulPost(
      suspendedSourceAuthor.id,
      'suspended source author',
    );
    const validQuote = await createQuote(
      quoteAuthor.id,
      deletedSource.id,
      'active-author Quote keeps deleted source behavior',
    );
    const suspendedSourceQuote = await createQuote(
      quoteAuthor.id,
      suspendedSource.id,
      'Quote with suspended source author',
    );
    const disabledSourceRepost = await createContentlessRepost(repostAuthor.id, disabledSource.id);
    const disabledOuterRepost = await createContentlessRepost(
      disabledOuterAuthor.id,
      deletedSource.id,
    );
    const disabledOrdinaryPost = await createContentfulPost(
      disabledOuterAuthor.id,
      'ordinary Post by disabled outer author',
    );
    const suspendedOrdinaryPost = await createContentfulPost(
      suspendedOuterAuthor.id,
      'ordinary Post by suspended outer author',
    );
    const suspendedOuterQuote = await createQuote(
      suspendedOuterAuthor.id,
      deletedSource.id,
      'Quote by suspended outer author',
    );

    await fanoutHomeTimelinePost({ postId: validPost.id });
    await fanoutHomeTimelinePost({ postId: validQuote.id });
    const cachedPostIds = [
      validPost.id,
      validQuote.id,
      disabledSourceRepost.id,
      suspendedSourceQuote.id,
      disabledOuterRepost.id,
      disabledOrdinaryPost.id,
      suspendedOrdinaryPost.id,
      suspendedOuterQuote.id,
    ];
    for (const postId of cachedPostIds.slice(2)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await fanoutHomeTimelinePost({ postId });
    }

    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(inArray(Profiles.id, [disabledOuterAuthor.id, disabledSourceAuthor.id]));
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(inArray(Profiles.id, [suspendedOuterAuthor.id, suspendedSourceAuthor.id]));
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, deletedSource.id));

    const redisEntries = await readHomeTimelineCache({ profileId: viewer.profile.id, limit: 20 });
    assert.ok(redisEntries);
    assert.deepEqual(redisEntries.entries.map(({ postId }) => postId).sort(), cachedPostIds.sort());

    const expectedVisibleIds = [validPost.id, validQuote.id]
      .map((id) => encodeGlobalId('Post', id))
      .sort();
    const cached = await requestHome(viewer.token, { first: 2 });
    assert.equal(cached.errors, undefined, JSON.stringify(cached.errors));
    assert.deepEqual(
      cached.data?.homeTimeline.edges.map(({ node }) => node.id).sort(),
      expectedVisibleIds,
    );
    assert.ok(cached.data?.homeTimeline.edges.every(({ cursor }) => /^redis:\d+$/.test(cursor)));

    const redisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const fallback = await requestHome(viewer.token, { first: 2 });
      assert.equal(fallback.errors, undefined, JSON.stringify(fallback.errors));
      assert.deepEqual(
        fallback.data?.homeTimeline.edges.map(({ node }) => node.id).sort(),
        expectedVisibleIds,
      );
    } finally {
      if (redisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = redisUrl;
      }
    }
  },
);

test(
  'keeps a cached Repost after a source Block but drops it after source Post deletion',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const repostAuthor = await createProfile('cached-repost-author');
    const sourceAuthor = await createProfile('cached-repost-source');
    await db.insert(ProfileFollows).values([
      { followerProfileId: viewer.profile.id, followeeProfileId: repostAuthor.id },
      { followerProfileId: viewer.profile.id, followeeProfileId: sourceAuthor.id },
    ]);
    const source = await createContentfulPost(
      sourceAuthor.id,
      'cached repost source body',
      undefined,
      PostVisibility.FOLLOWERS,
    );
    const repost = await createContentlessRepost(repostAuthor.id, source.id);
    await fanoutHomeTimelinePost({ postId: repost.id });
    await db.insert(ProfileBlocks).values({
      ownerProfileId: viewer.profile.id,
      targetProfileId: sourceAuthor.id,
    });

    const blockedSource = await requestGraphQL<{
      readonly homeTimeline: HomeConnection;
      readonly directSource: { readonly id: string } | null;
    }>(
      `query CachedHomeRepostAndDirectSource($sourceId: ID!) {
        homeTimeline(first: 10) {
          edges { cursor node { id content { bodyText } repostSource { id content { bodyText } } } }
          pageInfo { endCursor hasNextPage hasPreviousPage }
        }
        directSource: node(id: $sourceId) { ... on Post { id } }
      }`,
      { sourceId: encodeGlobalId('Post', source.id) },
      viewer.token,
    );
    assert.equal(blockedSource.errors, undefined, JSON.stringify(blockedSource.errors));
    assert.deepEqual(
      blockedSource.data?.homeTimeline.edges.map(({ node }) => [
        node.id,
        node.content?.bodyText ?? null,
        node.repostSource?.content?.bodyText ?? null,
      ]),
      [[encodeGlobalId('Post', repost.id), null, 'cached repost source body']],
    );
    assert.equal(blockedSource.data?.directSource, null);
    assert.match(blockedSource.data!.homeTimeline.edges[0]!.cursor, /^redis:\d+$/);

    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, source.id));
    const deletedSource = await requestHome(viewer.token, { first: 10 });
    assert.equal(deletedSource.errors, undefined, JSON.stringify(deletedSource.errors));
    assert.deepEqual(deletedSource.data?.homeTimeline.edges, []);
  },
);

test(
  'uses score cursors for cached rows and DB cursors after a cache boundary',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const cachedOlder = await createContentfulPost(viewer.profile.id, 'cached older post');
    await fanoutHomeTimelinePost({ postId: cachedOlder.id });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cached = await createContentfulPost(viewer.profile.id, 'cached newest post');
    await fanoutHomeTimelinePost({ postId: cached.id });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const missingFromCache = await createContentfulPost(
      viewer.profile.id,
      'database boundary post',
      '00000000-0000-7000-8000-000000000001',
    );

    const first = await requestHome(viewer.token, { first: 1 });
    assert.equal(first.errors, undefined, JSON.stringify(first.errors));
    assert.deepEqual(
      first.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', cached.id)],
    );
    assert.equal(first.data?.homeTimeline.pageInfo.hasNextPage, true);
    const redisCursor = first.data!.homeTimeline.edges[0]!.cursor;
    assert.match(redisCursor, /^redis:\d+$/);

    const second = await requestHome(viewer.token, { first: 2, after: redisCursor });
    assert.equal(second.errors, undefined, JSON.stringify(second.errors));
    assert.deepEqual(
      second.data?.homeTimeline.edges.map(({ node }) => node.id),
      [cachedOlder.id, missingFromCache.id].map((id) => encodeGlobalId('Post', id)),
    );
    assert.match(second.data!.homeTimeline.edges[0]!.cursor, /^redis:\d+$/);
    assert.match(second.data!.homeTimeline.edges[1]!.cursor, /^db:[0-9a-f-]+$/i);

    const filledCache = await waitForCachedPostIds(viewer.profile.id, [
      cached.id,
      cachedOlder.id,
      missingFromCache.id,
    ]);
    assert.deepEqual(
      filledCache.entries.map(({ postId }) => postId).sort(),
      [cached.id, cachedOlder.id, missingFromCache.id].sort(),
    );

    const backwards = await requestHome(viewer.token, {
      last: 1,
      before: second.data!.homeTimeline.edges[0]!.cursor,
    });
    assert.equal(backwards.errors, undefined, JSON.stringify(backwards.errors));
    assert.deepEqual(
      backwards.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', cached.id)],
    );
    assert.match(backwards.data!.homeTimeline.edges[0]!.cursor, /^redis:\d+$/);

    const next = await requestHome(viewer.token, {
      first: 1,
      after: second.data!.homeTimeline.edges[0]!.cursor,
    });
    assert.equal(next.errors, undefined, JSON.stringify(next.errors));
    assert.deepEqual(
      next.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', missingFromCache.id)],
    );
    assert.match(next.data!.homeTimeline.edges[0]!.cursor, /^redis:\d+$/);

    const cachedAfterBoundary = await requestHome(viewer.token, { first: 10 });
    assert.equal(cachedAfterBoundary.errors, undefined, JSON.stringify(cachedAfterBoundary.errors));
    assert.deepEqual(
      cachedAfterBoundary.data?.homeTimeline.edges.map(({ node }) => node.id).sort(),
      [cached.id, cachedOlder.id, missingFromCache.id]
        .map((id) => encodeGlobalId('Post', id))
        .sort(),
    );
    assert.ok(
      cachedAfterBoundary.data?.homeTimeline.edges.every(({ cursor }) =>
        /^redis:\d+$/.test(cursor),
      ),
    );

    const databaseCursor = await requestHome(viewer.token, {
      first: 1,
      after: `db:${cached.id}`,
    });
    assert.equal(databaseCursor.errors, undefined, JSON.stringify(databaseCursor.errors));
    assert.deepEqual(
      databaseCursor.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', cachedOlder.id)],
    );

    const legacyCursor = await requestHome(viewer.token, { first: 1, after: cached.id });
    assert.equal(legacyCursor.errors, undefined, JSON.stringify(legacyCursor.errors));
    assert.deepEqual(
      legacyCursor.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', cachedOlder.id)],
    );

    const malformedCursor = await requestHome(viewer.token, {
      first: 1,
      after: 'redis:not-a-score',
    });
    assert.equal(malformedCursor.errors, undefined, JSON.stringify(malformedCursor.errors));
    assert.deepEqual(
      malformedCursor.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', cached.id)],
    );

    const crossKindCursor = await requestHome(viewer.token, {
      first: 1,
      after: redisCursor,
      before: `db:${cached.id}`,
    });
    assert.equal(crossKindCursor.errors, undefined, JSON.stringify(crossKindCursor.errors));
    assert.deepEqual(
      crossKindCursor.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', cached.id)],
    );
  },
);

test(
  'authenticated Home reads renew cache expiry on Redis, DB cursor, and incompatible cursor paths',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const post = await createContentfulPost(viewer.profile.id, 'sliding Home cache expiry');
    await cacheHomeTimelinePage({ profileId: viewer.profile.id, postIds: [post.id] });
    const key = `kosmo:home-timeline:profile:${viewer.profile.id}`;
    const redisUrl = process.env.REDIS_URL;
    assert.ok(redisUrl);

    try {
      await runRedisCommand((client) => client.expire(key, 60));
      const redisPage = await requestHome(viewer.token, { first: 1 });
      assert.equal(redisPage.errors, undefined, JSON.stringify(redisPage.errors));
      const redisCursor = redisPage.data!.homeTimeline.edges[0]!.cursor;
      assert.match(redisCursor, /^redis:\d+$/);
      let ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
      assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);

      delete process.env.REDIS_URL;
      const databasePage = await requestHome(viewer.token, { first: 1 });
      assert.equal(databasePage.errors, undefined, JSON.stringify(databasePage.errors));
      const databaseCursor = databasePage.data!.homeTimeline.edges[0]!.cursor;
      assert.equal(databaseCursor, `db:${post.id}`);
      process.env.REDIS_URL = redisUrl;

      await runRedisCommand((client) => client.expire(key, 60));
      const afterDatabaseCursor = await requestHome(viewer.token, {
        first: 1,
        after: databaseCursor,
      });
      assert.equal(
        afterDatabaseCursor.errors,
        undefined,
        JSON.stringify(afterDatabaseCursor.errors),
      );
      ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
      assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);

      await runRedisCommand((client) => client.expire(key, 60));
      const incompatible = await requestHome(viewer.token, {
        first: 1,
        after: redisCursor,
        before: databaseCursor,
      });
      assert.equal(incompatible.errors, undefined, JSON.stringify(incompatible.errors));
      ttl = (await runRedisCommand((client) => client.ttl(key)))?.value;
      assert.ok(ttl !== undefined && ttl > 604_790 && ttl <= 604_800, `unexpected TTL ${ttl}`);
    } finally {
      process.env.REDIS_URL = redisUrl;
    }
  },
);

test(
  'seeds cold pages, appends forward DB pages, and skips continuation after invalidation',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const idPrefix = crypto.randomUUID().slice(0, 24);
    const posts: { readonly id: string; readonly contentId: string }[] = [];
    for (let index = 1; index <= 5; index += 1) {
      posts.push(
        await createContentfulPost(
          viewer.profile.id,
          `cold page post ${index}`,
          `${idPrefix}${index.toString(16).padStart(12, '0')}`,
        ),
      );
    }
    const expectedIds = posts.map(({ id }) => id);
    const lastPostId = expectedIds[0]!;
    const afterSecondVisiblePostId = expectedIds.at(-2)!;
    assert.equal(await readHomeTimelineCache({ profileId: viewer.profile.id, limit: 10 }), null);

    const cold = await requestHome(viewer.token, { first: 2 });
    assert.equal(cold.errors, undefined, JSON.stringify(cold.errors));
    assert.deepEqual(
      cold.data?.homeTimeline.edges.map(({ node }) => node.id),
      expectedIds
        .slice(-2)
        .reverse()
        .map((id) => encodeGlobalId('Post', id)),
    );
    assert.ok(cold.data!.homeTimeline.edges.every(({ cursor }) => cursor.startsWith('db:')));
    assert.equal(cold.data?.homeTimeline.pageInfo.hasNextPage, true);

    const firstSeed = await waitForCachedPostIds(viewer.profile.id, expectedIds.slice(-3));
    assert.deepEqual(
      firstSeed.entries.map(({ postId }) => postId).sort(),
      expectedIds.slice(-3).sort(),
    );

    const cachedFirstPage = await requestHome(viewer.token, { first: 2 });
    assert.equal(cachedFirstPage.errors, undefined, JSON.stringify(cachedFirstPage.errors));
    assert.deepEqual(
      cachedFirstPage.data?.homeTimeline.edges.map(({ node }) => node.id),
      expectedIds
        .slice(-2)
        .reverse()
        .map((id) => encodeGlobalId('Post', id)),
    );
    assert.ok(
      cachedFirstPage.data!.homeTimeline.edges.every(({ cursor }) => cursor.startsWith('redis:')),
    );
    assert.equal(cachedFirstPage.data?.homeTimeline.pageInfo.hasNextPage, true);

    const cachedContinuation = await requestHome(viewer.token, {
      first: 2,
      after: cachedFirstPage.data!.homeTimeline.edges.at(-1)!.cursor,
    });
    assert.equal(cachedContinuation.errors, undefined, JSON.stringify(cachedContinuation.errors));
    assert.deepEqual(
      cachedContinuation.data?.homeTimeline.edges.map(({ node }) => node.id),
      expectedIds
        .slice(-4, -2)
        .reverse()
        .map((id) => encodeGlobalId('Post', id)),
    );
    assert.match(cachedContinuation.data!.homeTimeline.edges[0]!.cursor, /^redis:\d+$/);
    assert.match(cachedContinuation.data!.homeTimeline.edges[1]!.cursor, /^db:[0-9a-f-]+$/i);
    assert.equal(cachedContinuation.data?.homeTimeline.pageInfo.hasNextPage, true);
    const fullCache = await waitForCachedPostIds(viewer.profile.id, expectedIds);
    assert.deepEqual(
      fullCache.entries.map(({ postId }) => postId),
      expectedIds.slice().reverse(),
    );

    const next = await requestHome(viewer.token, {
      first: 2,
      after: cold.data!.homeTimeline.edges.at(-1)!.cursor,
    });
    assert.equal(next.errors, undefined, JSON.stringify(next.errors));
    assert.deepEqual(
      next.data?.homeTimeline.edges.map(({ node }) => node.id),
      expectedIds
        .slice(-4, -2)
        .reverse()
        .map((id) => encodeGlobalId('Post', id)),
    );
    assert.ok(next.data!.homeTimeline.edges.every(({ cursor }) => cursor.startsWith('db:')));
    assert.equal(next.data?.homeTimeline.pageInfo.hasNextPage, true);

    const extendedSeed = await waitForCachedPostIds(viewer.profile.id, expectedIds);
    assert.deepEqual(
      extendedSeed.entries.map(({ postId }) => postId).sort(),
      expectedIds.slice().sort(),
    );

    const lastPage = await requestHome(viewer.token, {
      first: 2,
      after: next.data!.homeTimeline.edges.at(-1)!.cursor,
    });
    assert.equal(lastPage.errors, undefined, JSON.stringify(lastPage.errors));
    assert.deepEqual(
      lastPage.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', lastPostId)],
    );
    assert.equal(lastPage.data?.homeTimeline.edges[0]?.cursor, `db:${lastPostId}`);
    assert.equal(lastPage.data?.homeTimeline.pageInfo.hasNextPage, false);

    const cached = await requestHome(viewer.token, { first: 10 });
    assert.equal(cached.errors, undefined, JSON.stringify(cached.errors));
    assert.deepEqual(
      cached.data?.homeTimeline.edges.map(({ node }) => node.id).sort(),
      expectedIds.map((id) => encodeGlobalId('Post', id)).sort(),
    );
    assert.ok(cached.data!.homeTimeline.edges.every(({ cursor }) => cursor.startsWith('redis:')));

    await invalidateHomeTimelines({ profileIds: [viewer.profile.id] });
    const afterLoss = await requestHome(viewer.token, {
      first: 1,
      after: `db:${afterSecondVisiblePostId}`,
    });
    assert.equal(afterLoss.errors, undefined, JSON.stringify(afterLoss.errors));
    assert.equal(afterLoss.data?.homeTimeline.edges[0]?.cursor, `db:${expectedIds.at(-3)!}`);
    assert.equal(await readHomeTimelineCache({ profileId: viewer.profile.id, limit: 10 }), null);
  },
);

test(
  'falls back to older Home posts after removing the last cached entries and rebuilds the cold cache',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const idPrefix = crypto.randomUUID().slice(0, 24);
    const oldest = await createContentfulPost(
      viewer.profile.id,
      'oldest Home cache removal post',
      `${idPrefix}000000000001`,
    );
    const middle = await createContentfulPost(
      viewer.profile.id,
      'middle Home cache removal post',
      `${idPrefix}000000000002`,
    );
    const newest = await createContentfulPost(
      viewer.profile.id,
      'newest Home cache removal post',
      `${idPrefix}000000000003`,
    );

    const cold = await requestHome(viewer.token, { first: 1 });
    assert.equal(cold.errors, undefined, JSON.stringify(cold.errors));
    assert.deepEqual(
      cold.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', newest.id)],
    );
    assert.equal(cold.data?.homeTimeline.pageInfo.hasNextPage, true);
    assert.match(cold.data!.homeTimeline.edges[0]!.cursor, /^db:/);

    const cachedPage = await waitForCachedPostIds(viewer.profile.id, [newest.id, middle.id]);
    assert.deepEqual(
      cachedPage.entries.map(({ postId }) => postId).sort(),
      [newest.id, middle.id].sort(),
    );

    const cachedPostIds = [newest.id, middle.id];
    await db
      .update(Posts)
      .set({ state: PostState.DELETED })
      .where(inArray(Posts.id, cachedPostIds));
    for (const postId of cachedPostIds) {
      await removeHomeTimelinePost({ postId });
    }
    assert.equal(await readHomeTimelineCache({ profileId: viewer.profile.id, limit: 10 }), null);

    const fallback = await requestHome(viewer.token, { first: 1 });
    assert.equal(fallback.errors, undefined, JSON.stringify(fallback.errors));
    assert.deepEqual(
      fallback.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', oldest.id)],
    );
    assert.equal(fallback.data?.homeTimeline.edges[0]?.cursor, `db:${oldest.id}`);
    assert.equal(fallback.data?.homeTimeline.pageInfo.hasNextPage, false);

    const rebuilt = await waitForCachedPostIds(viewer.profile.id, [oldest.id]);
    assert.deepEqual(
      rebuilt.entries.map(({ postId }) => postId),
      [oldest.id],
    );
  },
);

test(
  'refills deleted cached entries from the next Redis batch before returning the page',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const posts: { readonly id: string; readonly contentId: string }[] = [];
    for (let index = 0; index < 4; index += 1) {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const post = await createContentfulPost(viewer.profile.id, `backfill post ${index}`);
      await fanoutHomeTimelinePost({ postId: post.id });
      posts.push(post);
    }
    const deletedCandidate = posts[2]!;
    await db
      .update(Posts)
      .set({ state: PostState.DELETED })
      .where(eq(Posts.id, deletedCandidate.id));

    const first = await requestHome(viewer.token, { first: 2 });
    assert.equal(first.errors, undefined, JSON.stringify(first.errors));
    assert.deepEqual(
      first.data?.homeTimeline.edges.map(({ node }) => node.id),
      [posts[3]!.id, posts[1]!.id].map((id) => encodeGlobalId('Post', id)),
    );
    assert.equal(first.data?.homeTimeline.pageInfo.hasNextPage, true);

    const next = await requestHome(viewer.token, {
      first: 1,
      after: first.data!.homeTimeline.edges.at(-1)!.cursor,
    });
    assert.equal(next.errors, undefined, JSON.stringify(next.errors));
    assert.deepEqual(
      next.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', posts[0]!.id)],
    );
  },
);

test('bounds Home DB candidate pages before natural-language filtering', async () => {
  const viewer = await createAuth();
  const candidateAuthor = await createProfile('natural-mute-page-author');
  await db.insert(ProfileFollows).values({
    followerProfileId: viewer.profile.id,
    followeeProfileId: candidateAuthor.id,
  });
  const hiddenAuthor = await createProfile('natural-mute-hidden-source');
  const hiddenSource = await createContentfulPost(
    hiddenAuthor.id,
    'hidden source must not reach the model',
    undefined,
    PostVisibility.DIRECT,
  );
  const idPrefix = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  const posts = [
    await createQuote(
      candidateAuthor.id,
      hiddenSource.id,
      'exclude-me visible quote body',
      `${idPrefix}000000000001`,
    ),
    await createContentfulPost(candidateAuthor.id, 'exclude-me post 2', `${idPrefix}000000000002`),
    await createContentfulPost(candidateAuthor.id, 'exclude-me post 3', `${idPrefix}000000000003`),
    await createContentfulPost(candidateAuthor.id, 'exclude-me post 4', `${idPrefix}000000000004`),
    await createContentfulPost(candidateAuthor.id, 'exclude-me post 5', `${idPrefix}000000000005`),
  ];
  await db.insert(NaturalLanguageMuteRules).values({
    ownerProfileId: viewer.profile.id,
    condition: 'exclude matching posts',
  });

  const redisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  const modelInputs: string[] = [];
  const restoreModel = installNaturalMuteModel((request) => {
    const text = naturalMuteInputText(request);
    modelInputs.push(text);
    return text.includes('exclude-me') ? 0.99 : 0.1;
  });
  try {
    const zero = await requestHome(viewer.token, { first: 0 });
    assert.equal(zero.errors, undefined, JSON.stringify(zero.errors));
    assert.deepEqual(zero.data?.homeTimeline.edges, []);
    assert.equal(zero.data?.homeTimeline.pageInfo.hasNextPage, true);
    assert.ok(
      modelInputs.length <= 1,
      `expected at most one lookahead decision, got ${modelInputs.length}`,
    );

    const callsAfterZero = modelInputs.length;
    const first = await requestHome(viewer.token, { first: 2 });
    assert.equal(first.errors, undefined, JSON.stringify(first.errors));
    assert.deepEqual(first.data?.homeTimeline.edges, []);
    assert.equal(first.data?.homeTimeline.pageInfo.startCursor, `db:${posts[4]!.id}`);
    assert.equal(first.data?.homeTimeline.pageInfo.endCursor, `db:${posts[3]!.id}`);
    assert.equal(first.data?.homeTimeline.pageInfo.hasNextPage, true);
    assert.equal(first.data?.homeTimeline.pageInfo.hasPreviousPage, false);
    assert.ok(
      modelInputs.length - callsAfterZero <= 3,
      `expected at most three candidate decisions, got ${modelInputs.length - callsAfterZero}`,
    );

    const next = await requestHome(viewer.token, {
      first: 1,
      after: first.data!.homeTimeline.pageInfo.endCursor!,
    });
    assert.equal(next.errors, undefined, JSON.stringify(next.errors));
    assert.deepEqual(next.data?.homeTimeline.edges, []);
    assert.equal(next.data?.homeTimeline.pageInfo.endCursor, `db:${posts[2]!.id}`);
    assert.equal(next.data?.homeTimeline.pageInfo.hasNextPage, true);

    const last = await requestHome(viewer.token, {
      first: 2,
      after: next.data!.homeTimeline.pageInfo.endCursor!,
    });
    assert.equal(last.errors, undefined, JSON.stringify(last.errors));
    assert.deepEqual(last.data?.homeTimeline.edges, []);
    assert.equal(last.data?.homeTimeline.pageInfo.endCursor, `db:${posts[0]!.id}`);
    assert.equal(last.data?.homeTimeline.pageInfo.hasNextPage, false);

    assert.ok(modelInputs.length > 0);
    assert.ok(modelInputs.some((text) => text.includes('exclude-me visible quote body')));
    assert.ok(
      modelInputs.every((text) => !text.includes('hidden source must not reach the model')),
    );
  } finally {
    restoreModel();
    if (redisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = redisUrl;
    }
  }
});

test(
  'lists existing selected-profile Smart Filter decisions independently of Home filtering',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const followedAuthor = await createProfile('smart-filter-results-followed-author');
    const mutedAuthor = await createProfile('smart-filter-results-muted-author');
    const unrelatedAuthor = await createProfile('smart-filter-results-unfollowed-author');
    const followerOnlyAuthor = await createProfile('smart-filter-results-follower-only-author');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: followedAuthor.id,
    });
    await db.insert(ProfileMutes).values({
      ownerProfileId: viewer.profile.id,
      targetProfileId: mutedAuthor.id,
    });

    const classified = await createContentfulPost(followedAuthor.id, 'classified by Home');
    const mutedPublic = await createContentfulPost(mutedAuthor.id, 'generally muted public post');
    const unrelatedPublic = await createContentfulPost(
      unrelatedAuthor.id,
      'unfollowed public post',
    );
    const inaccessible = await createContentfulPost(
      followerOnlyAuthor.id,
      'unfollowed followers-only post',
      undefined,
      PostVisibility.FOLLOWERS,
    );
    const ownPost = await createContentfulPost(viewer.profile.id, 'viewer authored post');
    const deletedPost = await createContentfulPost(followedAuthor.id, 'deleted public post');
    const contentlessPost = await createContentlessRepost(followedAuthor.id, classified.id);
    const invalidDecisionPost = await createContentfulPost(
      unrelatedAuthor.id,
      'malformed decision value',
    );
    const legacyOnly = await createContentfulPost(unrelatedAuthor.id, 'legacy-only decision');
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, deletedPost.id));
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.profile.id,
      condition: 'exclude matching posts',
    });

    const modelInputs: string[] = [];
    const restoreModel = installNaturalMuteModel((request) => {
      modelInputs.push(naturalMuteInputText(request));
      return 0.99;
    });
    const hashKey = naturalMuteDecisionHashKey(viewer.profile.id);
    const legacyKey = naturalMuteDecisionKey(viewer.profile.id, legacyOnly.id);
    const homeTimelineKey = `kosmo:home-timeline:profile:${viewer.profile.id}`;
    const decisionHashKeys = [hashKey];
    try {
      const home = await requestHome(viewer.token, { first: 10 });
      assert.equal(home.errors, undefined, JSON.stringify(home.errors));
      assert.ok(
        home.data?.homeTimeline.edges.every(
          ({ node }) => node.id !== encodeGlobalId('Post', classified.id),
        ),
      );
      assert.ok(modelInputs.some((text) => text.includes('classified by Home')));

      const seededDecisions = [
        { postId: mutedPublic.id, decision: { decision: 'exclude' as const, probability: 0.91 } },
        {
          postId: unrelatedPublic.id,
          decision: { decision: 'include' as const, probability: 0.43 },
        },
        { postId: inaccessible.id, decision: { decision: 'include' as const, probability: 0.61 } },
        { postId: ownPost.id, decision: { decision: 'exclude' as const, probability: 0.99 } },
        { postId: deletedPost.id, decision: { decision: 'include' as const, probability: 0.72 } },
        {
          postId: contentlessPost.id,
          decision: { decision: 'include' as const, probability: 0.22 },
        },
      ];
      await Promise.all(
        seededDecisions.map(({ postId, decision }) =>
          cacheNaturalLanguageMuteDecision(viewer.profile.id, postId, decision),
        ),
      );
      await runRedisCommand((client) =>
        client.hSetEx(
          hashKey,
          {
            [invalidDecisionPost.id]: '{',
            'not-a-uuid': JSON.stringify({ decision: 'include', probability: 0.25 }),
          },
          { expiration: { type: 'EX', value: 604_800 } },
        ),
      );
      await runRedisCommand((client) =>
        client.set(legacyKey, JSON.stringify({ decision: 'include', probability: 0.68 }), {
          EX: 60,
        }),
      );

      await runRedisCommand((client) =>
        client.zAdd(homeTimelineKey, { score: 123, value: classified.id }),
      );
      await runRedisCommand((client) => client.expire(homeTimelineKey, 60));
      const homeCacheBefore = (
        await runRedisCommand((client) => client.zRangeWithScores(homeTimelineKey, 0, -1))
      )?.value;
      const homeCacheTtlBefore = (await runRedisCommand((client) => client.ttl(homeTimelineKey)))
        ?.value;
      const hashTtlBefore = (
        await runRedisCommand((client) => client.hTTL(hashKey, [unrelatedPublic.id]))
      )?.value?.[0];
      assert.deepEqual(homeCacheBefore, [{ value: classified.id, score: 123 }]);
      assert.ok(homeCacheTtlBefore !== undefined && homeCacheTtlBefore > 50);
      assert.ok(hashTtlBefore !== undefined && hashTtlBefore > 50);

      const modelCallsBeforeResults = modelInputs.length;
      const result = await requestSmartFilterResults(viewer.token, { first: null });
      assert.equal(result.errors, undefined, JSON.stringify(result.errors));
      const connection = result.data?.smartFilterResultBatches;
      assert.ok(connection);
      assert.equal(connection.edges.length, 1);
      assert.equal(connection.pageInfo.hasPreviousPage, false);
      const posts = connection.edges[0]!.node.posts;
      const postIds = posts.map(({ id }) => id);
      assert.deepEqual(
        new Set(postIds),
        new Set([
          encodeGlobalId('Post', classified.id),
          encodeGlobalId('Post', mutedPublic.id),
          encodeGlobalId('Post', unrelatedPublic.id),
        ]),
      );
      assert.equal(modelInputs.length, modelCallsBeforeResults);

      const homeCacheAfter = (
        await runRedisCommand((client) => client.zRangeWithScores(homeTimelineKey, 0, -1))
      )?.value;
      const homeCacheTtlAfter = (await runRedisCommand((client) => client.ttl(homeTimelineKey)))
        ?.value;
      const hashTtlAfter = (
        await runRedisCommand((client) => client.hTTL(hashKey, [unrelatedPublic.id]))
      )?.value?.[0];
      assert.deepEqual(homeCacheAfter, homeCacheBefore);
      assert.ok(
        homeCacheTtlAfter !== undefined &&
          homeCacheTtlAfter > 0 &&
          homeCacheTtlAfter <= homeCacheTtlBefore,
      );
      assert.ok(hashTtlAfter !== undefined && hashTtlAfter > 0 && hashTtlAfter <= hashTtlBefore);

      const legacyProbability = await requestGraphQL<{
        readonly node: { readonly smartFilterProbability: number | null } | null;
      }>(
        `query LegacyPostProbability($id: ID!) { node(id: $id) { ... on Post { smartFilterProbability } } }`,
        { id: encodeGlobalId('Post', legacyOnly.id) },
        viewer.token,
      );
      assert.equal(legacyProbability.errors, undefined, JSON.stringify(legacyProbability.errors));
      assert.equal(legacyProbability.data?.node?.smartFilterProbability, 0.68);

      const invalidFirst = await requestSmartFilterResults(viewer.token, { first: 2 });
      assert.ok(invalidFirst.errors?.length);
      const malformedCursor = await requestSmartFilterResults(viewer.token, {
        after: 'not-a-cursor',
      });
      assert.ok(malformedCursor.errors?.length);
      const oversizedCursor = await requestSmartFilterResults(viewer.token, {
        after: '18446744073709551616',
      });
      assert.ok(oversizedCursor.errors?.length);

      const unauthenticated = await requestSmartFilterResults();
      assert.equal(unauthenticated.errors, undefined, JSON.stringify(unauthenticated.errors));
      assert.equal(unauthenticated.data?.smartFilterResultBatches, null);

      const previousRedisUrl = process.env.REDIS_URL;
      delete process.env.REDIS_URL;
      try {
        const unavailableRedis = await requestSmartFilterResults(viewer.token);
        assert.equal(unavailableRedis.errors, undefined, JSON.stringify(unavailableRedis.errors));
        assert.equal(unavailableRedis.data?.smartFilterResultBatches, null);
      } finally {
        if (previousRedisUrl === undefined) {
          delete process.env.REDIS_URL;
        } else {
          process.env.REDIS_URL = previousRedisUrl;
        }
      }

      const secondProfile = await createProfile('smart-filter-results-second-profile');
      decisionHashKeys.push(naturalMuteDecisionHashKey(secondProfile.id));
      await db.insert(AccountProfiles).values({
        accountId: viewer.account.id,
        profileId: secondProfile.id,
        role: AccountProfileRole.MEMBER,
      });
      await cacheNaturalLanguageMuteDecision(secondProfile.id, unrelatedPublic.id, {
        decision: 'include',
        probability: 0.42,
      });
      await db
        .update(Sessions)
        .set({ activeProfileId: secondProfile.id })
        .where(eq(Sessions.id, viewer.session.id));
      const secondProfileResult = await requestSmartFilterResults(viewer.token);
      assert.equal(
        secondProfileResult.errors,
        undefined,
        JSON.stringify(secondProfileResult.errors),
      );
      assert.deepEqual(
        secondProfileResult.data?.smartFilterResultBatches?.edges[0]?.node.posts.map(
          ({ id }) => id,
        ),
        [encodeGlobalId('Post', unrelatedPublic.id)],
      );

      const emptyProfile = await createProfile('smart-filter-results-empty-profile');
      await db.insert(AccountProfiles).values({
        accountId: viewer.account.id,
        profileId: emptyProfile.id,
        role: AccountProfileRole.MEMBER,
      });
      await db
        .update(Sessions)
        .set({ activeProfileId: emptyProfile.id })
        .where(eq(Sessions.id, viewer.session.id));
      const emptyResult = await requestSmartFilterResults(viewer.token);
      assert.equal(emptyResult.errors, undefined, JSON.stringify(emptyResult.errors));
      assert.deepEqual(
        emptyResult.data?.smartFilterResultBatches?.edges.map(({ node }) => node.posts),
        [[]],
      );
      assert.equal(emptyResult.data?.smartFilterResultBatches?.pageInfo.endCursor, '0');
      assert.equal(emptyResult.data?.smartFilterResultBatches?.pageInfo.hasNextPage, false);
      const terminalResult = await requestSmartFilterResults(viewer.token, {
        after: emptyResult.data?.smartFilterResultBatches?.pageInfo.endCursor,
      });
      assert.equal(terminalResult.errors, undefined, JSON.stringify(terminalResult.errors));
      assert.deepEqual(terminalResult.data?.smartFilterResultBatches?.edges, []);
      assert.equal(terminalResult.data?.smartFilterResultBatches?.pageInfo.hasPreviousPage, true);
      assert.equal(terminalResult.data?.smartFilterResultBatches?.pageInfo.hasNextPage, false);

      const pagedProfile = await createProfile('smart-filter-results-paged-profile');
      await db.insert(AccountProfiles).values({
        accountId: viewer.account.id,
        profileId: pagedProfile.id,
        role: AccountProfileRole.MEMBER,
      });
      const pagedHashKey = naturalMuteDecisionHashKey(pagedProfile.id);
      decisionHashKeys.push(pagedHashKey);
      const manyDecisions = Object.fromEntries(
        Array.from({ length: 600 }, () => [
          crypto.randomUUID(),
          JSON.stringify({ decision: 'include', probability: 0.42 }),
        ]),
      );
      await runRedisCommand((client) =>
        client.hSetEx(pagedHashKey, manyDecisions, {
          expiration: { type: 'EX', value: 604_800 },
        }),
      );
      await db
        .update(Sessions)
        .set({ activeProfileId: pagedProfile.id })
        .where(eq(Sessions.id, viewer.session.id));
      const firstNativePage = await requestSmartFilterResults(viewer.token);
      assert.equal(firstNativePage.errors, undefined, JSON.stringify(firstNativePage.errors));
      assert.equal(firstNativePage.data?.smartFilterResultBatches?.edges.length, 1);
      assert.deepEqual(firstNativePage.data?.smartFilterResultBatches?.edges[0]?.node.posts, []);
      const firstNativeCursor = firstNativePage.data?.smartFilterResultBatches?.pageInfo.endCursor;
      assert.ok(firstNativeCursor);
      assert.equal(firstNativePage.data?.smartFilterResultBatches?.pageInfo.hasNextPage, true);
      const secondNativePage = await requestSmartFilterResults(viewer.token, {
        after: firstNativeCursor,
      });
      assert.equal(secondNativePage.errors, undefined, JSON.stringify(secondNativePage.errors));
      assert.equal(secondNativePage.data?.smartFilterResultBatches?.edges.length, 1);
      assert.equal(secondNativePage.data?.smartFilterResultBatches?.pageInfo.hasPreviousPage, true);
      assert.notEqual(
        secondNativePage.data?.smartFilterResultBatches?.pageInfo.endCursor,
        firstNativeCursor,
      );
    } finally {
      restoreModel();
      await runRedisCommand((client) =>
        client.unlink([...decisionHashKeys, legacyKey, homeTimelineKey]),
      );
    }
  },
);

test(
  'reads legacy selected-profile Smart Filter probabilities without extending cache expiry',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const sourceAuthor = await createProfile('smart-filter-results-source-author');
    const quoteAuthor = await createProfile('smart-filter-results-quote-author');
    const repostAuthor = await createProfile('smart-filter-results-repost-author');
    const unjudgedAuthor = await createProfile('smart-filter-results-unjudged-author');
    await db.insert(ProfileFollows).values([
      { followerProfileId: viewer.profile.id, followeeProfileId: sourceAuthor.id },
      { followerProfileId: viewer.profile.id, followeeProfileId: quoteAuthor.id },
      { followerProfileId: viewer.profile.id, followeeProfileId: repostAuthor.id },
      { followerProfileId: viewer.profile.id, followeeProfileId: unjudgedAuthor.id },
    ]);

    const source = await createContentfulPost(sourceAuthor.id, 'cached result source');
    const quote = await createQuote(quoteAuthor.id, source.id, 'cached result quote');
    const repost = await createContentlessRepost(repostAuthor.id, source.id);
    const ownPost = await createContentfulPost(viewer.profile.id, 'viewer authored post');
    const ownQuote = await createQuote(viewer.profile.id, source.id, 'viewer authored quote');
    const ownSource = await createContentfulPost(viewer.profile.id, 'viewer authored source');
    const ownRepost = await createContentlessRepost(repostAuthor.id, ownSource.id);
    const unjudged = await createContentfulPost(unjudgedAuthor.id, 'no cached result yet');
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.profile.id,
      condition: 'exclude cached result misses',
    });

    const sourceKey = naturalMuteDecisionKey(viewer.profile.id, source.id);
    const homeTimelineKey = `kosmo:home-timeline:profile:${viewer.profile.id}`;
    const values = [
      [sourceKey, { decision: 'exclude', probability: 0.91 }],
      [
        naturalMuteDecisionKey(viewer.profile.id, quote.id),
        { decision: 'include', probability: 0.37 },
      ],
      [
        naturalMuteDecisionKey(viewer.profile.id, repost.id),
        { decision: 'include', probability: 0.14 },
      ],
      [
        naturalMuteDecisionKey(viewer.profile.id, ownPost.id),
        { decision: 'exclude', probability: 0.99 },
      ],
      [
        naturalMuteDecisionKey(viewer.profile.id, ownQuote.id),
        { decision: 'include', probability: 0.72 },
      ],
      [
        naturalMuteDecisionKey(viewer.profile.id, ownSource.id),
        { decision: 'exclude', probability: 0.83 },
      ],
      [
        naturalMuteDecisionKey(viewer.profile.id, ownRepost.id),
        { decision: 'include', probability: 0.22 },
      ],
    ] as const;
    const cacheKeys = values.map(([key]) => key);
    for (const [key, value] of values) {
      await runRedisCommand((client) =>
        client.set(key, JSON.stringify(value), { EX: key === sourceKey ? 60 : 604_800 }),
      );
    }
    await runRedisCommand((client) =>
      client.zAdd(homeTimelineKey, { score: 123, value: source.id }),
    );
    await runRedisCommand((client) => client.expire(homeTimelineKey, 60));
    const homeCacheBefore = (
      await runRedisCommand((client) => client.zRangeWithScores(homeTimelineKey, 0, -1))
    )?.value;
    const homeCacheTtlBefore = (await runRedisCommand((client) => client.ttl(homeTimelineKey)))
      ?.value;
    assert.deepEqual(homeCacheBefore, [{ value: source.id, score: 123 }]);
    assert.ok(homeCacheTtlBefore !== undefined && homeCacheTtlBefore > 50);
    const ttlBefore = (await runRedisCommand((client) => client.ttl(sourceKey)))?.value;
    assert.ok(ttlBefore !== undefined && ttlBefore > 50);

    const modelRequests: NaturalMuteRequest[] = [];
    const restoreModel = installNaturalMuteModel((request) => {
      modelRequests.push(request);
      return 0.99;
    });
    try {
      const queriedPosts = [
        source,
        quote,
        repost,
        ownPost,
        ownQuote,
        ownSource,
        ownRepost,
        unjudged,
      ];
      const postResults = await Promise.all(
        queriedPosts.map(({ id }) => requestPostProbability(viewer.token, id)),
      );
      for (const result of postResults) {
        assert.equal(result.errors, undefined, JSON.stringify(result.errors));
      }
      const probabilityById = new Map(
        postResults.map(({ data }) => [data?.node?.id, data?.node?.smartFilterProbability]),
      );
      const probabilityFor = (postId: string) =>
        probabilityById.get(encodeGlobalId('Post', postId));
      assert.equal(probabilityFor(source.id), 0.91);
      assert.equal(probabilityFor(quote.id), 0.37);
      assert.equal(probabilityFor(repost.id), 0.91);
      assert.equal(probabilityFor(ownPost.id), null);
      assert.equal(probabilityFor(ownQuote.id), null);
      assert.equal(probabilityFor(ownSource.id), null);
      assert.equal(probabilityFor(ownRepost.id), null);
      assert.equal(probabilityFor(unjudged.id), null);
      assert.equal(modelRequests.length, 0);

      const homeCacheAfter = (
        await runRedisCommand((client) => client.zRangeWithScores(homeTimelineKey, 0, -1))
      )?.value;
      const homeCacheTtlAfter = (await runRedisCommand((client) => client.ttl(homeTimelineKey)))
        ?.value;
      assert.deepEqual(homeCacheAfter, homeCacheBefore);
      assert.ok(
        homeCacheTtlAfter !== undefined &&
          homeCacheTtlAfter > 0 &&
          homeCacheTtlAfter <= homeCacheTtlBefore,
      );
      const ttlAfter = (await runRedisCommand((client) => client.ttl(sourceKey)))?.value;
      assert.ok(ttlAfter !== undefined && ttlAfter > 0 && ttlAfter <= ttlBefore);

      const secondProfile = await createProfile('smart-filter-results-second-profile');
      await db.insert(AccountProfiles).values({
        accountId: viewer.account.id,
        profileId: secondProfile.id,
        role: AccountProfileRole.MEMBER,
      });
      await db.insert(ProfileFollows).values({
        followerProfileId: secondProfile.id,
        followeeProfileId: sourceAuthor.id,
      });
      const secondProfileKey = naturalMuteDecisionKey(secondProfile.id, source.id);
      cacheKeys.push(secondProfileKey);
      await runRedisCommand((client) =>
        client.set(secondProfileKey, JSON.stringify({ decision: 'include', probability: 0.42 }), {
          EX: 60,
        }),
      );
      await db
        .update(Sessions)
        .set({ activeProfileId: secondProfile.id })
        .where(eq(Sessions.id, viewer.session.id));

      const secondProfileResult = await requestPostProbability(viewer.token, source.id);
      assert.equal(
        secondProfileResult.errors,
        undefined,
        JSON.stringify(secondProfileResult.errors),
      );
      assert.equal(secondProfileResult.data?.node?.smartFilterProbability, 0.42);

      const unauthenticated = await requestGraphQL<{
        readonly node: { readonly smartFilterProbability: number | null } | null;
      }>(
        `query PublicPostProbability($id: ID!) { node(id: $id) { ... on Post { smartFilterProbability } } }`,
        { id: encodeGlobalId('Post', source.id) },
      );
      assert.equal(unauthenticated.errors, undefined, JSON.stringify(unauthenticated.errors));
      assert.equal(unauthenticated.data?.node?.smartFilterProbability, null);
    } finally {
      restoreModel();
      await runRedisCommand((client) => client.unlink([...cacheKeys, homeTimelineKey]));
    }
  },
);

test('keeps forward and backward Home lookahead candidates for the next page', async () => {
  const forwardViewer = await createAuth();
  const forwardAuthor = await createProfile('natural-mute-forward-author');
  await db.insert(ProfileFollows).values({
    followerProfileId: forwardViewer.profile.id,
    followeeProfileId: forwardAuthor.id,
  });
  const forwardIdPrefix = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  const forwardPosts = [
    await createContentfulPost(
      forwardAuthor.id,
      'exclude-me oldest forward post',
      `${forwardIdPrefix}000000000001`,
    ),
    await createContentfulPost(
      forwardAuthor.id,
      'include forward lookahead',
      `${forwardIdPrefix}000000000002`,
    ),
    await createContentfulPost(
      forwardAuthor.id,
      'exclude-me middle forward post',
      `${forwardIdPrefix}000000000003`,
    ),
    await createContentfulPost(
      forwardAuthor.id,
      'exclude-me newest forward post',
      `${forwardIdPrefix}000000000004`,
    ),
  ];
  await db.insert(NaturalLanguageMuteRules).values({
    ownerProfileId: forwardViewer.profile.id,
    condition: 'exclude matching posts',
  });

  const backwardViewer = await createAuth();
  const backwardAuthor = await createProfile('natural-mute-backward-author');
  await db.insert(ProfileFollows).values({
    followerProfileId: backwardViewer.profile.id,
    followeeProfileId: backwardAuthor.id,
  });
  const backwardIdPrefix = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  const backwardPosts = [
    await createContentfulPost(
      backwardAuthor.id,
      'exclude-me oldest backward post',
      `${backwardIdPrefix}000000000001`,
    ),
    await createContentfulPost(
      backwardAuthor.id,
      'exclude-me before boundary backward post',
      `${backwardIdPrefix}000000000002`,
    ),
    await createContentfulPost(
      backwardAuthor.id,
      'exclude-me backward page post 1',
      `${backwardIdPrefix}000000000003`,
    ),
    await createContentfulPost(
      backwardAuthor.id,
      'exclude-me backward page post 2',
      `${backwardIdPrefix}000000000004`,
    ),
    await createContentfulPost(
      backwardAuthor.id,
      'include backward lookahead',
      `${backwardIdPrefix}000000000005`,
    ),
  ];
  await db.insert(NaturalLanguageMuteRules).values({
    ownerProfileId: backwardViewer.profile.id,
    condition: 'exclude matching posts',
  });

  const restoreModel = installNaturalMuteModel((request) =>
    naturalMuteInputText(request).includes('exclude-me') ? 0.99 : 0.1,
  );
  try {
    const forwardEmpty = await requestHome(forwardViewer.token, { first: 2 });
    assert.equal(forwardEmpty.errors, undefined, JSON.stringify(forwardEmpty.errors));
    assert.deepEqual(forwardEmpty.data?.homeTimeline.edges, []);
    assert.equal(forwardEmpty.data?.homeTimeline.pageInfo.endCursor, `db:${forwardPosts[2]!.id}`);
    assert.equal(forwardEmpty.data?.homeTimeline.pageInfo.hasNextPage, true);

    const forwardNext = await requestHome(forwardViewer.token, {
      first: 2,
      after: forwardEmpty.data!.homeTimeline.pageInfo.endCursor!,
    });
    assert.equal(forwardNext.errors, undefined, JSON.stringify(forwardNext.errors));
    assert.deepEqual(
      forwardNext.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', forwardPosts[1]!.id)],
    );
    assert.equal(forwardNext.data?.homeTimeline.pageInfo.endCursor, `db:${forwardPosts[0]!.id}`);
    assert.equal(forwardNext.data?.homeTimeline.pageInfo.hasNextPage, false);

    const backwardEmpty = await requestHome(backwardViewer.token, {
      last: 2,
      before: `db:${backwardPosts[1]!.id}`,
    });
    assert.equal(backwardEmpty.errors, undefined, JSON.stringify(backwardEmpty.errors));
    assert.deepEqual(backwardEmpty.data?.homeTimeline.edges, []);
    assert.equal(
      backwardEmpty.data?.homeTimeline.pageInfo.startCursor,
      `db:${backwardPosts[3]!.id}`,
    );
    assert.equal(backwardEmpty.data?.homeTimeline.pageInfo.hasPreviousPage, true);

    const backwardStartCursor = backwardEmpty.data!.homeTimeline.pageInfo.startCursor;
    assert.ok(backwardStartCursor);
    const backwardNext = await requestHome(backwardViewer.token, {
      last: 2,
      before: backwardStartCursor,
    });
    assert.equal(backwardNext.errors, undefined, JSON.stringify(backwardNext.errors));
    assert.deepEqual(
      backwardNext.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', backwardPosts[4]!.id)],
    );
    assert.equal(backwardNext.data?.homeTimeline.pageInfo.hasPreviousPage, false);
  } finally {
    restoreModel();
  }
});

test('projects stored PostContent and accessible quote source images into natural-language mute input', async () => {
  const viewer = await createAuth();
  const quoteAuthor = await createProfile('natural-mute-quote-author');
  await db.insert(ProfileFollows).values({
    followerProfileId: viewer.profile.id,
    followeeProfileId: quoteAuthor.id,
  });
  const sourceAuthor = await createProfile('natural-mute-accessible-source');
  const sourceImage = await createRemoteImageMedia(sourceAuthor.id);
  const quoteImage = await createRemoteImageMedia(quoteAuthor.id);
  const source = await createContentfulPost(sourceAuthor.id, 'source body');
  await db
    .update(PostContents)
    .set({
      document: postContentDocumentFromTextAndMedia(
        'source body',
        [{ mediaId: sourceImage.id }],
        true,
        'source warning',
      ),
    })
    .where(eq(PostContents.id, source.contentId));
  const quote = await createQuote(quoteAuthor.id, source.id, 'outer body');
  await db
    .update(PostContents)
    .set({
      document: postContentDocumentFromTextAndMedia(
        'outer body',
        [{ mediaId: quoteImage.id }],
        true,
        'outer warning',
      ),
    })
    .where(eq(PostContents.id, quote.contentId));
  await db.insert(NaturalLanguageMuteRules).values({
    ownerProfileId: viewer.profile.id,
    condition: 'EXCLUDE',
  });

  const modelRequests: NaturalMuteRequest[] = [];
  const restoreModel = installNaturalMuteModel((request) => {
    modelRequests.push(request);
    return 0.1;
  });
  try {
    const result = await requestHome(viewer.token, { first: 10 });
    assert.equal(result.errors, undefined, JSON.stringify(result.errors));
    assert.deepEqual(
      result.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', quote.id)],
    );
    assert.ok(
      modelRequests.some((request) => {
        const text = naturalMuteInputText(request);
        return (
          text.includes('outer body') &&
          text.includes('outer warning') &&
          text.includes('source body') &&
          text.includes('source warning')
        );
      }),
    );
    const imageUrls = modelRequests.flatMap(naturalMuteInputImageUrls);
    assert.ok(quoteImage.url);
    assert.ok(sourceImage.url);
    assert.ok(imageUrls.includes(quoteImage.url));
    assert.ok(imageUrls.includes(sourceImage.url));
  } finally {
    restoreModel();
  }
});

test(
  'keeps existing Home membership without running natural-language inference',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const post = await createContentfulPost(viewer.profile.id, 'already present in Home');
    await cacheHomeTimelinePage({ profileId: viewer.profile.id, postIds: [post.id] });
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.profile.id,
      condition: 'exclude every post',
    });

    let calls = 0;
    const restoreModel = installNaturalMuteModel(() => {
      calls += 1;
      return 0.99;
    });
    try {
      const result = await requestHome(viewer.token, { first: 10 });
      assert.equal(result.errors, undefined, JSON.stringify(result.errors));
      assert.deepEqual(
        result.data?.homeTimeline.edges.map(({ node }) => [node.id, node.content?.bodyText]),
        [[encodeGlobalId('Post', post.id), 'already present in Home']],
      );

      await insertHomeTimelinePost({ postId: post.id, profileId: viewer.profile.id });
      await fanoutHomeTimelinePost({ postId: post.id });
      await reconcileHomeTimelineFollow({ profileId: viewer.profile.id });
      assert.equal(calls, 0);
      assert.ok(
        (await readHomeTimelineCache({ profileId: viewer.profile.id, limit: 10 }))?.entries.some(
          ({ postId }) => postId === post.id,
        ),
      );
    } finally {
      restoreModel();
    }
  },
);

test(
  'keeps per-Profile verdicts across rule edits and bypasses the old verdict after rule deletion',
  { skip: !testRedisUrl },
  async () => {
    const excludedViewer = await createAuth();
    const includedViewer = await createAuth();
    const author = await createProfile('natural-mute-shared-author');
    await db.insert(ProfileFollows).values([
      { followerProfileId: excludedViewer.profile.id, followeeProfileId: author.id },
      { followerProfileId: includedViewer.profile.id, followeeProfileId: author.id },
    ]);
    const post = await createContentfulPost(author.id, 'shared candidate');
    const [excludedRule] = await db
      .insert(NaturalLanguageMuteRules)
      .values({ ownerProfileId: excludedViewer.profile.id, condition: 'EXCLUDE' })
      .returning();
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: includedViewer.profile.id,
      condition: 'INCLUDE',
    });

    let calls = 0;
    const restoreModel = installNaturalMuteModel((request) => {
      calls += 1;
      const condition = request.questions[0]?.instructions.at(-1)?.text ?? '';
      return condition.includes('EXCLUDE') ? 0.99 : 0.1;
    });
    try {
      const excluded = await requestHome(excludedViewer.token, { first: 10 });
      assert.equal(excluded.errors, undefined, JSON.stringify(excluded.errors));
      assert.deepEqual(excluded.data?.homeTimeline.edges, []);

      const included = await requestHome(includedViewer.token, { first: 10 });
      assert.equal(included.errors, undefined, JSON.stringify(included.errors));
      assert.deepEqual(
        included.data?.homeTimeline.edges.map(({ node }) => node.id),
        [encodeGlobalId('Post', post.id)],
      );
      assert.equal(calls, 2);

      await db
        .update(NaturalLanguageMuteRules)
        .set({ condition: 'INCLUDE' })
        .where(eq(NaturalLanguageMuteRules.id, excludedRule!.id));
      const afterEdit = await requestHome(excludedViewer.token, { first: 10 });
      assert.equal(afterEdit.errors, undefined, JSON.stringify(afterEdit.errors));
      assert.deepEqual(afterEdit.data?.homeTimeline.edges, []);
      assert.equal(calls, 2);

      await db
        .delete(NaturalLanguageMuteRules)
        .where(eq(NaturalLanguageMuteRules.id, excludedRule!.id));
      const afterDelete = await requestHome(excludedViewer.token, { first: 10 });
      assert.equal(afterDelete.errors, undefined, JSON.stringify(afterDelete.errors));
      assert.deepEqual(
        afterDelete.data?.homeTimeline.edges.map(({ node }) => node.id),
        [encodeGlobalId('Post', post.id)],
      );
      assert.equal(calls, 2);
    } finally {
      restoreModel();
    }
  },
);

test(
  'uses one source verdict for a batch of Reposts while preserving viewer-authored content',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const sourceAuthor = await createProfile('natural-mute-unfollowed-source');
    const firstReposter = await createProfile('natural-mute-first-reposter');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: firstReposter.id,
    });
    const source = await createContentfulPost(sourceAuthor.id, 'exclude-me shared source');
    const ownPost = await createContentfulPost(viewer.profile.id, 'exclude-me own post');
    const ownQuote = await createQuote(viewer.profile.id, source.id, 'exclude-me own quote');
    const reposts = [
      await createContentlessRepost(viewer.profile.id, source.id),
      await createContentlessRepost(firstReposter.id, source.id),
    ];
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.profile.id,
      condition: 'exclude matching posts',
    });

    const decisionHashKey = naturalMuteDecisionHashKey(viewer.profile.id);
    const legacyDecisionKeys = [
      ownPost.id,
      ownQuote.id,
      source.id,
      ...reposts.map(({ id }) => id),
    ].map((postId) => naturalMuteDecisionKey(viewer.profile.id, postId));
    const decisionKeys = [decisionHashKey, ...legacyDecisionKeys];
    const staleOwnDecision = JSON.stringify({ decision: 'exclude', probability: 0.99 });
    const staleRepostDecision = JSON.stringify({ decision: 'include', probability: 0.1 });
    await runRedisCommand((client) =>
      client.set(naturalMuteDecisionKey(viewer.profile.id, ownPost.id), staleOwnDecision, {
        EX: 604_800,
      }),
    );
    await runRedisCommand((client) =>
      client.set(naturalMuteDecisionKey(viewer.profile.id, reposts[0]!.id), staleRepostDecision, {
        EX: 604_800,
      }),
    );

    const modelRequests: NaturalMuteRequest[] = [];
    const restoreModel = installNaturalMuteModel((request) => {
      modelRequests.push(request);
      return 0.99;
    });
    try {
      const result = await requestHome(viewer.token, { first: 10 });
      assert.equal(result.errors, undefined, JSON.stringify(result.errors));
      assert.deepEqual(
        result.data?.homeTimeline.edges.map(({ node }) => node.id).sort(),
        [encodeGlobalId('Post', ownPost.id), encodeGlobalId('Post', ownQuote.id)].sort(),
      );
      assert.equal(modelRequests.length, 1);
      const input = naturalMuteInputText(modelRequests[0]!);
      assert.ok(input.includes('exclude-me shared source'));
      assert.ok(!input.includes('exclude-me own post'));
      assert.ok(!input.includes('exclude-me own quote'));
      assert.equal(
        (
          await runRedisCommand((client) =>
            client.get(naturalMuteDecisionKey(viewer.profile.id, ownPost.id)),
          )
        )?.value,
        staleOwnDecision,
      );
      assert.equal(
        (
          await runRedisCommand((client) =>
            client.get(naturalMuteDecisionKey(viewer.profile.id, ownQuote.id)),
          )
        )?.value,
        null,
      );
      assert.equal(
        (await runRedisCommand((client) => client.hGet(decisionHashKey, source.id)))?.value,
        JSON.stringify({ decision: 'exclude', probability: 0.99 }),
      );
      assert.equal(
        (
          await runRedisCommand((client) =>
            client.get(naturalMuteDecisionKey(viewer.profile.id, source.id)),
          )
        )?.value,
        null,
      );
      assert.equal(
        (
          await runRedisCommand((client) =>
            client.get(naturalMuteDecisionKey(viewer.profile.id, reposts[0]!.id)),
          )
        )?.value,
        staleRepostDecision,
      );
      for (const repost of reposts.slice(1)) {
        assert.equal(
          (
            await runRedisCommand((client) =>
              client.get(naturalMuteDecisionKey(viewer.profile.id, repost.id)),
            )
          )?.value,
          null,
        );
      }
    } finally {
      restoreModel();
      await runRedisCommand((client) => client.unlink(decisionKeys));
    }
  },
);

test(
  "includes a Repost of the viewer's own source without a semantic decision",
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const reposter = await createProfile('natural-mute-own-source-reposter');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: reposter.id,
    });
    const source = await createContentfulPost(viewer.profile.id, 'exclude-me viewer source');
    const repost = await createContentlessRepost(reposter.id, source.id);
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.profile.id,
      condition: 'exclude matching posts',
    });

    const decisionHashKey = naturalMuteDecisionHashKey(viewer.profile.id);
    const legacyDecisionKeys = [source.id, repost.id].map((postId) =>
      naturalMuteDecisionKey(viewer.profile.id, postId),
    );
    const decisionKeys = [decisionHashKey, ...legacyDecisionKeys];
    let calls = 0;
    const restoreModel = installNaturalMuteModel(() => {
      calls += 1;
      return 0.99;
    });
    try {
      const result = await requestHome(viewer.token, { first: 10 });
      assert.equal(result.errors, undefined, JSON.stringify(result.errors));
      assert.deepEqual(
        result.data?.homeTimeline.edges.map(({ node }) => node.id).sort(),
        [encodeGlobalId('Post', source.id), encodeGlobalId('Post', repost.id)].sort(),
      );
      assert.equal(calls, 0);
      for (const key of legacyDecisionKeys) {
        assert.equal((await runRedisCommand((client) => client.get(key)))?.value, null);
      }
      for (const postId of [source.id, repost.id]) {
        assert.equal(
          (await runRedisCommand((client) => client.hGet(decisionHashKey, postId)))?.value,
          null,
        );
      }
    } finally {
      restoreModel();
      await runRedisCommand((client) => client.unlink(decisionKeys));
    }
  },
);

test(
  'classifies a Quote independently after its source verdict is cached for a Repost',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const sourceAuthor = await createProfile('natural-mute-quote-verdict-source');
    const reposter = await createProfile('natural-mute-quote-verdict-reposter');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: reposter.id,
    });
    const source = await createContentfulPost(sourceAuthor.id, 'shared cached source');
    const repost = await createContentlessRepost(reposter.id, source.id);
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.profile.id,
      condition: 'classify source and quote separately',
    });

    const quoteAuthor = await createProfile('natural-mute-independent-quote-author');
    const quote = await createQuote(quoteAuthor.id, source.id, 'independent quote body');
    const quoteKey = naturalMuteDecisionKey(viewer.profile.id, quote.id);
    const sourceKey = naturalMuteDecisionKey(viewer.profile.id, source.id);
    const repostKey = naturalMuteDecisionKey(viewer.profile.id, repost.id);
    const decisionHashKey = naturalMuteDecisionHashKey(viewer.profile.id);
    const modelRequests: NaturalMuteRequest[] = [];
    const restoreModel = installNaturalMuteModel((request) => {
      modelRequests.push(request);
      return naturalMuteInputText(request).includes('independent quote body') ? 0.1 : 0.99;
    });
    try {
      const sourceResult = await requestHome(viewer.token, { first: 10 });
      assert.equal(sourceResult.errors, undefined, JSON.stringify(sourceResult.errors));
      assert.deepEqual(sourceResult.data?.homeTimeline.edges, []);
      assert.equal(modelRequests.length, 1);
      assert.ok(naturalMuteInputText(modelRequests[0]!).includes('shared cached source'));
      assert.equal(
        (await runRedisCommand((client) => client.hGet(decisionHashKey, source.id)))?.value,
        JSON.stringify({ decision: 'exclude', probability: 0.99 }),
      );
      assert.equal((await runRedisCommand((client) => client.get(sourceKey)))?.value, null);

      await db.insert(ProfileFollows).values({
        followerProfileId: viewer.profile.id,
        followeeProfileId: quoteAuthor.id,
      });
      const quoteResult = await requestHome(viewer.token, { first: 10 });
      assert.equal(quoteResult.errors, undefined, JSON.stringify(quoteResult.errors));
      assert.deepEqual(
        quoteResult.data?.homeTimeline.edges.map(({ node }) => node.id),
        [encodeGlobalId('Post', quote.id)],
      );
      assert.equal(modelRequests.length, 2);
      const quoteInput = naturalMuteInputText(modelRequests[1]!);
      assert.ok(quoteInput.includes('independent quote body'));
      assert.ok(quoteInput.includes('shared cached source'));
      assert.equal(
        (await runRedisCommand((client) => client.hGet(decisionHashKey, quote.id)))?.value,
        JSON.stringify({ decision: 'include', probability: 0.1 }),
      );
      assert.equal((await runRedisCommand((client) => client.get(quoteKey)))?.value, null);
      assert.equal(
        (await runRedisCommand((client) => client.hGet(decisionHashKey, repost.id)))?.value,
        null,
      );
      assert.equal((await runRedisCommand((client) => client.get(repostKey)))?.value, null);
    } finally {
      restoreModel();
      await runRedisCommand((client) =>
        client.unlink([decisionHashKey, quoteKey, sourceKey, repostKey]),
      );
    }
  },
);

test(
  'uses a Reposted Quote and its direct source as the independent verdict input',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const sourceAuthor = await createProfile('natural-mute-quoted-source-author');
    const quoteAuthor = await createProfile('natural-mute-reposted-quote-author');
    const reposter = await createProfile('natural-mute-quote-reposter');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: reposter.id,
    });
    const source = await createContentfulPost(sourceAuthor.id, 'direct source context');
    const quote = await createQuote(quoteAuthor.id, source.id, 'direct Quote subject');
    const repost = await createContentlessRepost(reposter.id, quote.id);
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.profile.id,
      condition: 'exclude this Quote',
    });

    const quoteKey = naturalMuteDecisionKey(viewer.profile.id, quote.id);
    const sourceKey = naturalMuteDecisionKey(viewer.profile.id, source.id);
    const repostKey = naturalMuteDecisionKey(viewer.profile.id, repost.id);
    const decisionHashKey = naturalMuteDecisionHashKey(viewer.profile.id);
    const modelRequests: NaturalMuteRequest[] = [];
    const restoreModel = installNaturalMuteModel((request) => {
      modelRequests.push(request);
      return 0.99;
    });
    try {
      const result = await requestHome(viewer.token, { first: 10 });
      assert.equal(result.errors, undefined, JSON.stringify(result.errors));
      assert.deepEqual(result.data?.homeTimeline.edges, []);
      assert.equal(modelRequests.length, 1);
      const input = naturalMuteInputText(modelRequests[0]!);
      assert.ok(input.includes('direct Quote subject'));
      assert.ok(input.includes('direct source context'));
      assert.equal(
        (await runRedisCommand((client) => client.hGet(decisionHashKey, quote.id)))?.value,
        JSON.stringify({ decision: 'exclude', probability: 0.99 }),
      );
      assert.equal((await runRedisCommand((client) => client.get(quoteKey)))?.value, null);
      assert.equal(
        (await runRedisCommand((client) => client.hGet(decisionHashKey, source.id)))?.value,
        null,
      );
      assert.equal(
        (await runRedisCommand((client) => client.hGet(decisionHashKey, repost.id)))?.value,
        null,
      );
      assert.equal((await runRedisCommand((client) => client.get(sourceKey)))?.value, null);
      assert.equal((await runRedisCommand((client) => client.get(repostKey)))?.value, null);
    } finally {
      restoreModel();
      await runRedisCommand((client) =>
        client.unlink([decisionHashKey, quoteKey, sourceKey, repostKey]),
      );
    }
  },
);

test(
  'includes classifier failures without storing a semantic verdict',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const author = await createProfile('natural-mute-failing-author');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: author.id,
    });
    const post = await createContentfulPost(author.id, 'temporarily unavailable classifier');
    await db.insert(NaturalLanguageMuteRules).values({
      ownerProfileId: viewer.profile.id,
      condition: 'EXCLUDE',
    });

    let calls = 0;
    const restoreModel = installNaturalMuteModel(() => {
      calls += 1;
      if (calls === 1) {
        throw new Error('model request failed');
      }
      return 0.99;
    });
    try {
      const failedAttempt = await requestHome(viewer.token, { first: 10 });
      assert.equal(failedAttempt.errors, undefined, JSON.stringify(failedAttempt.errors));
      assert.deepEqual(
        failedAttempt.data?.homeTimeline.edges.map(({ node }) => node.id),
        [encodeGlobalId('Post', post.id)],
      );

      await invalidateHomeTimelines({ profileIds: [viewer.profile.id] });
      const retry = await requestHome(viewer.token, { first: 10 });
      assert.equal(retry.errors, undefined, JSON.stringify(retry.errors));
      assert.deepEqual(retry.data?.homeTimeline.edges, []);
      assert.equal(calls, 2);
    } finally {
      restoreModel();
    }
  },
);

test(
  'filters deleted cached rows and does not reuse a cache for another selected Profile',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const cached = await createContentfulPost(viewer.profile.id, 'cached own post');
    await fanoutHomeTimelinePost({ postId: cached.id });
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, cached.id));

    const deleted = await requestHome(viewer.token, { first: 10 });
    assert.equal(deleted.errors, undefined, JSON.stringify(deleted.errors));
    assert.deepEqual(deleted.data?.homeTimeline.edges, []);

    const firstSelectedProfile = await createAuth();
    const firstPost = await createContentfulPost(firstSelectedProfile.profile.id, 'first profile');
    await fanoutHomeTimelinePost({ postId: firstPost.id });
    const secondProfile = await createProfile('second-selected-profile');
    await db.insert(AccountProfiles).values({
      accountId: firstSelectedProfile.account.id,
      profileId: secondProfile.id,
      role: AccountProfileRole.MEMBER,
    });
    const secondPost = await createContentfulPost(secondProfile.id, 'second profile');
    const firstProfileResult = await requestHome(firstSelectedProfile.token, { first: 10 });
    assert.equal(firstProfileResult.errors, undefined, JSON.stringify(firstProfileResult.errors));
    assert.deepEqual(
      firstProfileResult.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', firstPost.id)],
    );

    await db
      .update(Sessions)
      .set({ activeProfileId: secondProfile.id })
      .where(eq(Sessions.id, firstSelectedProfile.session.id));
    const secondProfileResult = await requestHome(firstSelectedProfile.token, { first: 10 });
    assert.equal(secondProfileResult.errors, undefined, JSON.stringify(secondProfileResult.errors));
    assert.deepEqual(
      secondProfileResult.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', secondPost.id)],
    );
  },
);

test('falls back to the DB Home policy when Redis is unconfigured', async () => {
  const viewer = await createAuth();
  const ownPost = await createContentfulPost(viewer.profile.id, 'db-only Home post');
  const redisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  try {
    const result = await requestHome(viewer.token, { first: 10 });
    assert.equal(result.errors, undefined, JSON.stringify(result.errors));
    assert.deepEqual(
      result.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', ownPost.id)],
    );
  } finally {
    if (redisUrl) {
      process.env.REDIS_URL = redisUrl;
    }
  }
});

async function createAuth(): Promise<Auth> {
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const account = await db
    .insert(Accounts)
    .values({
      displayName: `Home viewer ${suffix}`,
      oidcSubject: `home-viewer-${suffix}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  fixtureAccountIds.push(account.id);
  const profile = await createProfile(`home-viewer-${suffix}`);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: profile.id,
      state: SessionState.ACTIVE,
      token: `home-token-${suffix}`,
    })
    .returning()
    .then(firstOrThrow);

  return { account, profile, session, token: session.token };
}

async function createProfile(handlePrefix: string) {
  const handle = `${handlePrefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstanceId,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  fixtureProfileIds.push(profile.id);
  return profile;
}

async function createContentfulPost(
  profileId: string,
  bodyText: string,
  id?: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) {
  const post = await db
    .insert(Posts)
    .values({
      ...(id === undefined ? {} : { id }),
      profileId,
      state: PostState.ACTIVE,
      visibility,
    })
    .returning()
    .then(firstOrThrow);
  fixturePostIds.push(post.id);
  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText(bodyText), postId: post.id })
    .returning()
    .then(firstOrThrow);
  fixtureContentIds.push(content.id);
  await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
  return { id: post.id, contentId: content.id };
}

async function createRemoteImageMedia(profileId: string) {
  const media = await db
    .insert(Media)
    .values({
      mediaType: 'image/webp',
      profileId,
      source: MediaSource.REMOTE,
      state: MediaState.READY,
      url: `https://media.example/${crypto.randomUUID()}.webp`,
    })
    .returning()
    .then(firstOrThrow);
  fixtureMediaIds.push(media.id);
  return media;
}

async function createQuote(profileId: string, sourcePostId: string, bodyText: string, id?: string) {
  const quote = await createContentfulPost(profileId, bodyText, id);
  await db.update(Posts).set({ repostSourceId: sourcePostId }).where(eq(Posts.id, quote.id));
  return quote;
}

async function createContentlessRepost(profileId: string, sourcePostId: string) {
  const repost = await db
    .insert(Posts)
    .values({
      profileId,
      repostSourceId: sourcePostId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  fixturePostIds.push(repost.id);
  return { id: repost.id };
}

async function waitForCachedPostIds(profileId: string, postIds: readonly string[]) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const cache = await readHomeTimelineCache({ profileId, limit: 1_000 });
    if (
      cache !== null &&
      postIds.every((postId) => cache.entries.some((entry) => entry.postId === postId))
    ) {
      return cache;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Home cache did not contain ${postIds.length} expected posts`);
}

async function waitForRedis() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const ping = await runRedisCommand((client) => client.ping());
    if (ping?.value === 'PONG') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('Dedicated Home timeline test Redis did not become ready');
}

async function requestHome(
  token: string,
  pagination: {
    readonly first?: number;
    readonly last?: number;
    readonly after?: string;
    readonly before?: string;
    readonly includeSmartFilterProbability?: boolean;
  },
) {
  return requestGraphQL<{ homeTimeline: HomeConnection }>(
    `query HomeTimeline(
      $first: Int,
      $last: Int,
      $after: String,
      $before: String,
      $includeSmartFilterProbability: Boolean = false
    ) {
      homeTimeline(first: $first, last: $last, after: $after, before: $before) {
        edges { cursor node { id content { bodyText } repostSource { id content { bodyText } } smartFilterProbability @include(if: $includeSmartFilterProbability) } }
        pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
      }
    }`,
    pagination,
    token,
  );
}

async function requestSmartFilterResults(
  token?: string,
  pagination: { readonly first?: number | null; readonly after?: string | null } = {},
) {
  return requestGraphQL<{ smartFilterResultBatches: SmartFilterResultConnection | null }>(
    `query SmartFilterResultBatches($first: Int, $after: String) {
      smartFilterResultBatches(first: $first, after: $after) {
        edges { cursor node { posts { id smartFilterProbability } } }
        pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
      }
    }`,
    pagination,
    token,
  );
}

async function requestPostProbability(token: string, postId: string) {
  return requestGraphQL<{
    readonly node: { readonly id: string; readonly smartFilterProbability: number | null } | null;
  }>(
    `query PostProbability($id: ID!) { node(id: $id) { ... on Post { id smartFilterProbability } } }`,
    { id: encodeGlobalId('Post', postId) },
    token,
  );
}

async function requestGraphQL<TData>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<GraphQLResult<TData>> {
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
}

function naturalMuteInputText(request: NaturalMuteRequest): string {
  return request.input
    .flatMap(({ content }) =>
      content.flatMap(({ text, type }) => (type === 'input_text' && text ? [text] : [])),
    )
    .join('\n');
}

function naturalMuteDecisionKey(profileId: string, postId: string): string {
  return `kosmo:home-timeline:natural-language-mute:profile:${profileId}:post:${postId}`;
}

function naturalMuteDecisionHashKey(profileId: string): string {
  return `kosmo:home-timeline:natural-language-mute:profile:${profileId}`;
}

function naturalMuteInputImageUrls(request: NaturalMuteRequest): string[] {
  return request.input.flatMap(({ content }) =>
    content.flatMap(({ image_url, type }) =>
      type === 'input_image' && image_url ? [image_url] : [],
    ),
  );
}

function installNaturalMuteModel(decide: (request: NaturalMuteRequest) => number): () => void {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-natural-language-mute-key';
  globalThis.fetch = (async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as NaturalMuteRequest;
    return Response.json({
      answers: [
        {
          type: 'predicate',
          name: 'matches_mute_condition',
          probability: decide(request),
        },
      ],
    });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousApiKey;
    }
  };
}
