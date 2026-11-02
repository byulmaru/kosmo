import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as HomeTimelineCache from '@kosmo/core/home-timeline/cache';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const testRedisUrl = process.env.KOSMO_TEST_REDIS_URL;
if (testRedisUrl) {
  process.env.REDIS_URL = testRedisUrl;
}
process.env.DATABASE_URL = databaseUrl;

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Posts: typeof CoreDb.Posts;
let PostContents: typeof CoreDb.PostContents;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileMutes: typeof CoreDb.ProfileMutes;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let fanoutHomeTimelinePost: typeof HomeTimelineCache.fanoutHomeTimelinePost;
let invalidateHomeTimelines: typeof HomeTimelineCache.invalidateHomeTimelines;
let readHomeTimelineCache: typeof HomeTimelineCache.readHomeTimelineCache;
let rebuildHomeTimeline: typeof HomeTimelineCache.rebuildHomeTimeline;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;
const fixtureProfileIds: string[] = [];
const fixtureAccountIds: string[] = [];
const fixturePostIds: string[] = [];
const fixtureContentIds: string[] = [];

type GraphQLResult<TData> = {
  readonly data?: TData | null;
  readonly errors?: readonly { readonly message: string }[];
};

type HomeConnection = {
  readonly edges: readonly {
    readonly cursor: string;
    readonly node: {
      readonly id: string;
      readonly content: { readonly bodyText: string } | null;
      readonly repostSource?: {
        readonly id: string;
        readonly content: { readonly bodyText: string } | null;
      } | null;
    };
  }[];
  readonly pageInfo: {
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

before(async () => {
  if (testRedisUrl) {
    process.env.REDIS_URL = testRedisUrl;
  }
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_ORIGIN = 'http://127.0.0.1:4173';
  process.env.ENVIRONMENT = 'test';

  ({
    AccountProfiles,
    Accounts,
    db,
    firstOrThrow,
    Instances,
    pg,
    Posts,
    PostContents,
    ProfileBlocks,
    ProfileFollows,
    ProfileMutes,
    Profiles,
    Sessions,
  } = await import('@kosmo/core/db'));
  ({ fanoutHomeTimelinePost, invalidateHomeTimelines, readHomeTimelineCache, rebuildHomeTimeline } =
    await import('@kosmo/core/home-timeline/cache'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
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
    await db.delete(AccountProfiles).where(inArray(AccountProfiles.accountId, fixtureAccountIds));
    await db.delete(Accounts).where(inArray(Accounts.id, fixtureAccountIds));
    await db.delete(Profiles).where(inArray(Profiles.id, fixtureProfileIds));
  }
  if (localInstanceId) {
    await db.delete(Instances).where(eq(Instances.id, localInstanceId));
  }
  await pg.end();
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
    await rebuildReadyCache(viewer.profile.id);
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
    await rebuildReadyCache(viewer.profile.id);
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
  'keeps a cached contentless repost source readable but drops the repost when its source is deleted',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    const repostAuthor = await createProfile('cached-repost-author');
    const sourceAuthor = await createProfile('cached-repost-source');
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: repostAuthor.id,
    });
    await db.insert(ProfileFollows).values({
      followerProfileId: viewer.profile.id,
      followeeProfileId: sourceAuthor.id,
    });
    await rebuildReadyCache(viewer.profile.id);
    const source = await createContentfulPost(
      sourceAuthor.id,
      'cached repost source body',
      undefined,
      PostVisibility.FOLLOWERS,
    );
    const repost = await db
      .insert(Posts)
      .values({
        profileId: repostAuthor.id,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    fixturePostIds.push(repost.id);
    await fanoutHomeTimelinePost({ postId: repost.id });
    await db.insert(ProfileBlocks).values({
      ownerProfileId: viewer.profile.id,
      targetProfileId: sourceAuthor.id,
    });

    const stale = await requestGraphQL<{
      homeTimeline: HomeConnection;
      directSource: { id: string } | null;
    }>(
      `query CachedRepostSource($sourceId: ID!) {
        homeTimeline(first: 10) {
          edges { node { id content { bodyText } repostSource { id content { bodyText } } } }
          pageInfo { endCursor hasNextPage hasPreviousPage }
        }
        directSource: node(id: $sourceId) { ... on Post { id } }
      }`,
      { sourceId: encodeGlobalId('Post', source.id) },
      viewer.token,
    );
    assert.equal(stale.errors, undefined, JSON.stringify(stale.errors));
    assert.deepEqual(
      stale.data?.homeTimeline.edges.map(({ node }) => [
        node.id,
        node.content?.bodyText ?? null,
        node.repostSource?.content?.bodyText ?? null,
      ]),
      [[encodeGlobalId('Post', repost.id), null, 'cached repost source body']],
    );
    assert.equal(stale.data?.directSource, null);

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
    await rebuildReadyCache(viewer.profile.id);
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

    const second = await requestHome(viewer.token, { first: 1, after: redisCursor });
    assert.equal(second.errors, undefined, JSON.stringify(second.errors));
    assert.deepEqual(
      second.data?.homeTimeline.edges.map(({ node }) => node.id),
      [encodeGlobalId('Post', cachedOlder.id)],
    );
    assert.match(second.data!.homeTimeline.edges[0]!.cursor, /^redis:\d+$/);

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
    assert.match(next.data!.homeTimeline.edges[0]!.cursor, /^db:[0-9a-f-]+$/i);

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
  'restarts with DB cursors after Home cache loss and returns to score cursors after background rebuild',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    await createContentfulPost(viewer.profile.id, 'cached before Redis loss');
    await rebuildReadyCache(viewer.profile.id);

    const cached = await requestHome(viewer.token, { first: 10 });
    assert.equal(cached.errors, undefined, JSON.stringify(cached.errors));
    assert.ok(cached.data?.homeTimeline.edges.length);
    const redisCursor = cached.data!.homeTimeline.edges[0]!.cursor;
    assert.match(redisCursor, /^redis:\d+$/);

    await invalidateHomeTimelines({ profileIds: [viewer.profile.id] });
    assert.equal(await readHomeTimelineCache({ profileId: viewer.profile.id, limit: 1 }), null);

    const afterLoss = await requestHome(viewer.token, { first: 10, after: redisCursor });
    assert.equal(afterLoss.errors, undefined, JSON.stringify(afterLoss.errors));
    assert.ok(afterLoss.data?.homeTimeline.edges.length);
    assert.match(afterLoss.data!.homeTimeline.edges[0]!.cursor, /^db:[0-9a-f-]+$/i);

    let rebuiltCache = await readHomeTimelineCache({ profileId: viewer.profile.id, limit: 1 });
    for (let attempt = 0; attempt < 20 && rebuiltCache === null; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      rebuiltCache = await readHomeTimelineCache({ profileId: viewer.profile.id, limit: 1 });
    }
    assert.ok(rebuiltCache, 'Home cache was not rebuilt after the DB fallback');

    const rebuilt = await requestHome(viewer.token, { first: 10 });
    assert.equal(rebuilt.errors, undefined, JSON.stringify(rebuilt.errors));
    assert.ok(rebuilt.data?.homeTimeline.edges.length);
    assert.match(rebuilt.data!.homeTimeline.edges[0]!.cursor, /^redis:\d+$/);
  },
);

test(
  'refills deleted cached entries from the next Redis batch before returning the page',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    await rebuildReadyCache(viewer.profile.id);
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

test(
  'filters deleted cached rows and does not reuse a cache for another selected Profile',
  { skip: !testRedisUrl },
  async () => {
    const viewer = await createAuth();
    await rebuildReadyCache(viewer.profile.id);
    const cached = await createContentfulPost(viewer.profile.id, 'cached own post');
    await fanoutHomeTimelinePost({ postId: cached.id });
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, cached.id));

    const deleted = await requestHome(viewer.token, { first: 10 });
    assert.equal(deleted.errors, undefined, JSON.stringify(deleted.errors));
    assert.deepEqual(deleted.data?.homeTimeline.edges, []);

    const firstSelectedProfile = await createAuth();
    await rebuildReadyCache(firstSelectedProfile.profile.id);
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

async function rebuildReadyCache(profileId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await rebuildHomeTimeline({ profileId });
    const cache = await readHomeTimelineCache({ profileId, limit: 1 });
    if (cache !== null) {
      return cache;
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
  },
) {
  return requestGraphQL<{ homeTimeline: HomeConnection }>(
    `query HomeTimeline($first: Int, $last: Int, $after: String, $before: String) {
      homeTimeline(first: $first, last: $last, after: $after, before: $before) {
        edges { cursor node { id content { bodyText } repostSource { id content { bodyText } } } }
        pageInfo { endCursor hasNextPage hasPreviousPage }
      }
    }`,
    pagination,
    token,
  );
}

async function requestGraphQL<TData>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<GraphQLResult<TData>> {
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
}
