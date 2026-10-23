import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId as globalId } from '@kosmo/core/global-id';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Hashtags: typeof CoreDb.Hashtags;
let PostContentHashtags: typeof CoreDb.PostContentHashtags;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileMutes: typeof CoreDb.ProfileMutes;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let pg: typeof CoreDb.pg;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;

type GraphQLErrorResult = {
  extensions?: { code?: string };
  message: string;
};

type GraphQLResult<TData = Record<string, unknown>> = {
  data?: TData | null;
  errors?: GraphQLErrorResult[];
};

type PostsConnection = {
  edges: Array<{ cursor: string; node: { id: string } }>;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
};

type HashtagPostsData = {
  node: { posts: PostsConnection } | null;
};

const postsQuery = `query HashtagPosts($id: ID!, $after: String, $first: Int) {
  node(id: $id) {
    ... on Hashtag {
      posts(first: $first, after: $after) {
        edges { cursor node { id } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }
}`;

describe('GraphQL Hashtag posts', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      db,
      firstOrThrow,
      Hashtags,
      PostContentHashtags,
      PostContents,
      Posts,
      ProfileMutes,
      Profiles,
      Sessions,
      pg,
    } = await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../../src/context'));
    ({ yoga } = await import('../../../src/graphql'));

    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('context', await deriveContext(c));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => resetFixtures());

  after(async () => {
    await pg.end();
  });

  test('lists only public current tagged posts and does not inherit a source post tag', async () => {
    const publisher = await createAuthenticatedSession();
    const created = await requestGraphQL<{
      createPost: { post: { id: string } };
    }>(
      `mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) { post { id } }
      }`,
      {
        input: { bodyText: '#FlowTag from the createPost API', visibility: PostVisibility.PUBLIC },
      },
      publisher.token,
    );

    assertNoGraphQLErrors(created);
    const hashtag = await db
      .select()
      .from(Hashtags)
      .where(eq(Hashtags.name, 'flowtag'))
      .then(firstOrThrow);
    const tagId = hashtag.id;
    const directAuthor = await createProfile('direct-author');
    const source = await createContentfulPost(directAuthor.id, [tagId]);
    const quoteAuthor = await createProfile('quote-author');
    const inheritedQuote = await createContentfulPost(quoteAuthor.id, [], {
      repostSourceId: source.post.id,
    });
    const ownTagQuote = await createContentfulPost(quoteAuthor.id, [tagId], {
      repostSourceId: source.post.id,
    });
    const contentlessRepost = await db
      .insert(Posts)
      .values({
        profileId: quoteAuthor.id,
        repostSourceId: source.post.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    const reply = await createContentfulPost(directAuthor.id, [tagId], {
      replyParentId: source.post.id,
    });
    const unlisted = await createContentfulPost(directAuthor.id, [tagId], {
      visibility: PostVisibility.UNLISTED,
    });
    const deleted = await createContentfulPost(directAuthor.id, [tagId], {
      state: PostState.DELETED,
    });
    const disabledProfile = await createProfile('disabled-author', ProfileState.DISABLED);
    const disabledPost = await createContentfulPost(disabledProfile.id, [tagId]);
    const stale = await createContentfulPost(directAuthor.id, [tagId]);
    const currentRevision = await db
      .insert(PostContents)
      .values({
        document: postContentDocumentFromText('tag removed in current revision'),
        postId: stale.post.id,
      })
      .returning()
      .then(firstOrThrow);
    await db
      .update(Posts)
      .set({ currentContentId: currentRevision.id })
      .where(eq(Posts.id, stale.post.id));

    const firstPage = await requestGraphQL<HashtagPostsData>(postsQuery, {
      first: 2,
      id: globalId('Hashtag', tagId),
    });

    assertNoGraphQLErrors(firstPage);
    const firstPosts = firstPage.data?.node?.posts;
    assert.ok(firstPosts);
    assert.equal(firstPosts.edges.length, 2);
    assert.equal(firstPosts.pageInfo.hasNextPage, true);
    const endCursor = firstPosts.pageInfo.endCursor;
    assert.ok(endCursor);

    const secondPage = await requestGraphQL<HashtagPostsData>(postsQuery, {
      after: endCursor,
      first: 2,
      id: globalId('Hashtag', tagId),
    });

    assertNoGraphQLErrors(secondPage);
    const secondPosts = secondPage.data?.node?.posts;
    assert.ok(secondPosts);
    assert.equal(secondPosts.edges.length, 1);
    assert.equal(secondPosts.pageInfo.hasNextPage, false);

    const listedIds = [
      ...firstPosts.edges.map(({ node }) => node.id),
      ...secondPosts.edges.map(({ node }) => node.id),
    ];
    const expectedIds = [
      created.data!.createPost.post.id,
      globalId('Post', source.post.id),
      globalId('Post', ownTagQuote.post.id),
    ];
    assert.deepEqual(new Set(listedIds), new Set(expectedIds));
    assert.equal(new Set(listedIds).size, listedIds.length);
    assert.equal(listedIds.includes(globalId('Post', inheritedQuote.post.id)), false);
    assert.equal(listedIds.includes(globalId('Post', contentlessRepost.id)), false);
    assert.equal(listedIds.includes(globalId('Post', reply.post.id)), false);
    assert.equal(listedIds.includes(globalId('Post', unlisted.post.id)), false);
    assert.equal(listedIds.includes(globalId('Post', deleted.post.id)), false);
    assert.equal(listedIds.includes(globalId('Post', disabledPost.post.id)), false);
    assert.equal(listedIds.includes(globalId('Post', stale.post.id)), false);
  });

  test('applies the selected profile mute before pagination and scopes it to that profile', async () => {
    const hashtag = await db
      .insert(Hashtags)
      .values({ displayName: 'mute-pagination', name: 'mute-pagination' })
      .returning()
      .then(firstOrThrow);
    const sourceAuthor = await createProfile('mute-source-author');
    const source = await createContentfulPost(sourceAuthor.id, []);
    const quoteAuthor = await createProfile('mute-quote-author');
    const quote = await createContentfulPost(quoteAuthor.id, [hashtag.id], {
      id: orderedPostId(5),
      repostSourceId: source.post.id,
    });
    const authors = await Promise.all(
      [1, 2, 3, 4].map((index) => createProfile(`mute-author-${index}`)),
    );
    const posts = await Promise.all(
      authors.map((author, index) =>
        createContentfulPost(author.id, [hashtag.id], {
          id: orderedPostId(4 - index),
        }),
      ),
    );
    const auth = await createAuthenticatedSession();
    const otherSelectedProfile = await createProfile('second-selected-profile');
    await db.insert(AccountProfiles).values({
      accountId: auth.accountId,
      profileId: otherSelectedProfile.id,
      role: AccountProfileRole.OWNER,
    });
    await db.insert(ProfileMutes).values([
      { ownerProfileId: auth.profile.id, targetProfileId: authors[0]!.id },
      { ownerProfileId: auth.profile.id, targetProfileId: sourceAuthor.id },
    ]);

    const firstPage = await requestGraphQL<HashtagPostsData>(
      postsQuery,
      { first: 1, id: globalId('Hashtag', hashtag.id) },
      auth.token,
    );

    assertNoGraphQLErrors(firstPage);
    assert.deepEqual(
      firstPage.data?.node?.posts.edges.map(({ node }) => node.id),
      [globalId('Post', posts[1]!.post.id)],
    );
    assert.equal(firstPage.data?.node?.posts.pageInfo.hasNextPage, true);

    const secondPage = await requestGraphQL<HashtagPostsData>(
      postsQuery,
      {
        after: firstPage.data?.node?.posts.pageInfo.endCursor,
        first: 1,
        id: globalId('Hashtag', hashtag.id),
      },
      auth.token,
    );

    assertNoGraphQLErrors(secondPage);
    assert.deepEqual(
      secondPage.data?.node?.posts.edges.map(({ node }) => node.id),
      [globalId('Post', posts[2]!.post.id)],
    );

    await db
      .delete(ProfileMutes)
      .where(
        and(
          eq(ProfileMutes.ownerProfileId, auth.profile.id),
          eq(ProfileMutes.targetProfileId, authors[0]!.id),
        ),
      );
    const afterUnmute = await requestGraphQL<HashtagPostsData>(
      postsQuery,
      { first: 1, id: globalId('Hashtag', hashtag.id) },
      auth.token,
    );

    assertNoGraphQLErrors(afterUnmute);
    assert.deepEqual(
      afterUnmute.data?.node?.posts.edges.map(({ node }) => node.id),
      [globalId('Post', posts[0]!.post.id)],
    );

    await db.insert(ProfileMutes).values([
      { ownerProfileId: auth.profile.id, targetProfileId: authors[0]!.id },
      { ownerProfileId: otherSelectedProfile.id, targetProfileId: authors[1]!.id },
    ]);
    await db
      .update(Sessions)
      .set({ activeProfileId: otherSelectedProfile.id })
      .where(eq(Sessions.token, auth.token));
    const otherProfilePage = await requestGraphQL<HashtagPostsData>(
      postsQuery,
      { first: 2, id: globalId('Hashtag', hashtag.id) },
      auth.token,
    );

    assertNoGraphQLErrors(otherProfilePage);
    assert.deepEqual(
      otherProfilePage.data?.node?.posts.edges.map(({ node }) => node.id),
      [globalId('Post', quote.post.id), globalId('Post', posts[0]!.post.id)],
    );
    assert.equal(otherProfilePage.data?.node?.posts.pageInfo.hasNextPage, true);
  });
});

const requestGraphQL = async <TData = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<GraphQLResult<TData>> => {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await app.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers,
    method: 'POST',
  });

  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const createContentfulPost = async (
  profileId: string,
  hashtagIds: readonly string[],
  {
    id = crypto.randomUUID(),
    replyParentId,
    repostSourceId,
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: {
    id?: string;
    replyParentId?: string;
    repostSourceId?: string;
    state?: PostState;
    visibility?: PostVisibility;
  } = {},
) => {
  const post = await db
    .insert(Posts)
    .values({ id, profileId, replyParentId, repostSourceId, state, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText('test post'), postId: post.id })
    .returning()
    .then(firstOrThrow);

  if (hashtagIds.length > 0) {
    await db
      .insert(PostContentHashtags)
      .values(hashtagIds.map((hashtagId) => ({ hashtagId, postContentId: content.id })));
  }

  await db.update(Posts).set({ currentContentId: content.id }).where(eq(Posts.id, post.id));
  return { content, post };
};

const orderedPostId = (value: number) =>
  `018f0000-0000-7000-8000-${value.toString(16).padStart(12, '0')}`;

const createProfile = async (handle: string, state: ProfileState = ProfileState.ACTIVE) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async () => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Test Account',
      oidcSubject: `subject-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(`viewer-${crypto.randomUUID().slice(0, 8)}`);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const token = `token-${crypto.randomUUID()}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: profile.id,
    state: SessionState.ACTIVE,
    token,
  });

  return { accountId: account.id, profile, token };
};

const resetFixtures = async () => {
  await db.update(Posts).set({ currentContentId: null, replyParentId: null, repostSourceId: null });
  await db.delete(PostContentHashtags);
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(ProfileMutes);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Hashtags);
  await db.delete(Profiles);
};

const truncateDatabase = async () => {
  const testDatabaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(new Set(['127.0.0.1', '[::1]', 'localhost']).has(testDatabaseUrl.hostname));
  assert.match(testDatabaseUrl.pathname, /^\/kosmo_test(?:_[a-z0-9_]+)?$/);

  await pg.unsafe(`
    DO $$
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement || ' CASCADE';
      END IF;
    END $$;
  `);
};
