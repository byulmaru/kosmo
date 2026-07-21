import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
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
import { normalizeHandle } from '@kosmo/core/utils';
import { eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';
import type { encodeGlobalId as EncodeGlobalId } from '../../../src/graphql/global-id';

const publicOrigin = 'http://127.0.0.1:4173';
process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let Bookmarks: typeof CoreDb.Bookmarks;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let encodeGlobalId: typeof EncodeGlobalId;
let app: Hono<Env>;
let localInstanceId: string;

describe('Bookmark GraphQL 경계', () => {
  before(async () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      Bookmarks,
      db,
      firstOrThrow,
      Instances,
      Notifications,
      pg,
      Posts,
      ProfileFollows,
      Profiles,
      Sessions,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = await import('@kosmo/core/db/seed');

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../../src/context'));
    ({ yoga } = await import('../../../src/graphql'));
    ({ encodeGlobalId } = await import('../../../src/graphql/global-id'));

    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('context', await deriveContext(c));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => {
    await resetFixtures();
  });

  after(async () => {
    await pg.end();
  });

  test('정상·순차·동시 생성은 같은 Bookmark Node와 관계를 반환한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);

    const first = await requestCreateBookmark(post.id, auth.token);
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => requestCreateBookmark(post.id, auth.token)),
    );

    assertNoGraphQLErrors(first);
    concurrent.forEach(assertNoGraphQLErrors);
    const bookmark = first.data?.createBookmark.bookmark;
    assert.ok(bookmark);
    assert.ok(
      concurrent.every(
        ({ data }) =>
          data?.createBookmark.bookmark.id === bookmark.id &&
          data.createBookmark.bookmark.createdAt === bookmark.createdAt,
      ),
    );
    assert.deepEqual(bookmark, {
      __typename: 'Bookmark',
      createdAt: bookmark.createdAt,
      id: bookmark.id,
      post: { id: encodeGlobalId('Post', post.id) },
      profile: { id: encodeGlobalId('Profile', auth.profile.id) },
    });
    const stored = await db.select().from(Bookmarks).where(eq(Bookmarks.postId, post.id));
    assert.equal(stored.length, 1);
    assert.equal(bookmark.id, encodeGlobalId('Bookmark', stored[0]!.id));
  });

  test('서로 다른 선택 Profile은 같은 Post를 독립적으로 저장한다', async () => {
    const [firstAuth, secondAuth] = await Promise.all([
      createAuthenticatedSession(),
      createAuthenticatedSession(),
    ]);
    const author = await createProfile('shared-author');
    const post = await createPost(author.id);

    const [first, second] = await Promise.all([
      requestCreateBookmark(post.id, firstAuth.token),
      requestCreateBookmark(post.id, secondAuth.token),
    ]);

    assertNoGraphQLErrors(first);
    assertNoGraphQLErrors(second);
    assert.notEqual(
      first.data?.createBookmark.bookmark.id,
      second.data?.createBookmark.bookmark.id,
    );
    assert.equal(await db.$count(Bookmarks, eq(Bookmarks.postId, post.id)), 2);
  });

  test('없거나 조회할 수 없는 Post는 같은 NOT_FOUND로 숨긴다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('hidden-author');
    const hiddenPost = await createPost(author.id, {
      visibility: PostVisibility.DIRECT,
    });
    const deletedPost = await createPost(author.id, { state: PostState.DELETED });

    for (const postId of [hiddenPost.id, deletedPost.id, crypto.randomUUID()]) {
      const result = await requestCreateBookmark(postId, auth.token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    }
    assert.equal(await countBookmarks(), 0);
  });

  test('비로그인·비활성 Account·사용 불가 Profile은 PERMISSION_DENIED로 거부한다', async () => {
    const author = await createProfile('actor-check-author');
    const post = await createPost(author.id);
    const suffix = crypto.randomUUID();
    const remoteInstanceId = crypto.randomUUID();
    const unresponsiveInstanceId = crypto.randomUUID();
    await db.insert(Instances).values([
      { id: remoteInstanceId, domain: `remote-${suffix}.example`, kind: InstanceKind.ACTIVITYPUB },
      {
        id: unresponsiveInstanceId,
        domain: `unresponsive-${suffix}.example`,
        kind: InstanceKind.LOCAL,
        state: InstanceState.UNRESPONSIVE,
      },
    ]);
    const actors = await Promise.all([
      createAuthenticatedSession({ activeProfile: false }),
      createAuthenticatedSession({ accountState: AccountState.DISABLED }),
      createAuthenticatedSession({ member: false }),
      createAuthenticatedSession({ profileState: ProfileState.DISABLED }),
      createAuthenticatedSession({ instanceId: remoteInstanceId }),
      createAuthenticatedSession({ instanceId: unresponsiveInstanceId }),
    ]);

    for (const token of [undefined, ...actors.map(({ token }) => token)]) {
      const result = await requestCreateBookmark(post.id, token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }
    assert.equal(await countBookmarks(), 0);
  });

  test('Post가 아닌 concrete global ID는 mutation input에서 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const result = await requestGraphQL<{ createBookmark: { bookmark: BookmarkNode } }>(
      `mutation CreateBookmark($input: CreateBookmarkInput!) {
        createBookmark(input: $input) { bookmark { id } }
      }`,
      { input: { postId: encodeGlobalId('Profile', auth.profile.id) } },
      auth.token,
    );

    assert.ok(result.errors?.[0]);
    assert.equal(await countBookmarks(), 0);
  });

  test('Bookmark Node는 Owner에게만 관계를 공개하고 Notification을 만들지 않는다', async () => {
    const owner = await createAuthenticatedSession();
    const other = await createAuthenticatedSession();
    const author = await createProfile('bookmark-node-author');
    const post = await createPost(author.id);
    const created = await requestCreateBookmark(post.id, owner.token);
    const bookmarkId = created.data?.createBookmark.bookmark.id;
    assert.ok(bookmarkId);

    const ownerNode = await requestBookmarkNode(bookmarkId, owner.token);
    assertNoGraphQLErrors(ownerNode);
    assert.deepEqual(ownerNode.data?.node, created.data?.createBookmark.bookmark);

    await db.update(Posts).set({ visibility: PostVisibility.DIRECT }).where(eq(Posts.id, post.id));
    const hiddenPostNode = await requestBookmarkNode(bookmarkId, owner.token);
    assertNoGraphQLErrors(hiddenPostNode);
    assert.deepEqual(hiddenPostNode.data?.node, {
      ...created.data?.createBookmark.bookmark,
      post: null,
    });

    for (const token of [other.token, undefined]) {
      const hiddenNode = await requestBookmarkNode(bookmarkId, token);
      assertNoGraphQLErrors(hiddenNode);
      assert.equal(hiddenNode.data?.node, null);
    }
    assert.equal(await db.$count(Notifications), 0);
  });

  test('allows only the selected owner Profile to read the connection and Bookmark Node', async () => {
    const owner = await createAuthenticatedSession();
    const other = await createAuthenticatedSession();
    const target = await createPost((await createProfile('author')).id);
    const bookmark = await createBookmark(owner.profile.id, target.id);
    const ownerProfileId = encodeGlobalId('Profile', owner.profile.id);
    const bookmarkId = encodeGlobalId('Bookmark', bookmark.id);
    await db.insert(AccountProfiles).values({
      accountId: owner.account.id,
      profileId: other.profile.id,
      role: AccountProfileRole.MEMBER,
    });

    const owned = await loadBookmarkConnection(ownerProfileId, owner.token, { first: 10 });
    assertNoGraphQLErrors(owned);
    assert.deepEqual(
      owned.data?.node?.bookmarks.edges.map(({ node }) => node.id),
      [bookmarkId],
    );

    const wrongProfile = await loadBookmarkConnection(
      encodeGlobalId('Profile', other.profile.id),
      owner.token,
      { first: 10 },
    );
    assert.equal(wrongProfile.data?.node, null);
    assert.equal(wrongProfile.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const otherViewer = await loadBookmarkConnection(ownerProfileId, other.token, { first: 10 });
    assert.equal(otherViewer.data?.node, null);
    assert.equal(otherViewer.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const unauthenticated = await loadBookmarkConnection(ownerProfileId, undefined, { first: 10 });
    assert.equal(unauthenticated.data?.node, null);
    assert.equal(unauthenticated.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    assert.deepEqual(await loadBookmarkNodes([bookmarkId], owner.token), [
      { id: bookmarkId, post: { id: encodeGlobalId('Post', target.id) } },
    ]);
    assert.deepEqual(await loadBookmarkNodes([bookmarkId], other.token), [null]);
    assert.deepEqual(await loadBookmarkNodes([bookmarkId]), [null]);
  });

  test('filters with the shared Post policy before applying ID-only pagination', async () => {
    const owner = await createAuthenticatedSession();
    const author = await createProfile('page-author');
    const visibleNewest = await createPost(author.id, { visibility: PostVisibility.PUBLIC });
    const hiddenNewest = await createPost(author.id, { state: PostState.DELETED });
    const visibleMiddle = await createPost(author.id, { visibility: PostVisibility.UNLISTED });
    const hiddenMiddle = await createPost(author.id, { visibility: PostVisibility.FOLLOWERS });
    const visibleOldest = await createPost(owner.profile.id, {
      visibility: PostVisibility.FOLLOWERS,
    });

    const bookmarks = await Promise.all([
      createBookmark(owner.profile.id, visibleNewest.id, uuid(900)),
      createBookmark(owner.profile.id, hiddenNewest.id, uuid(850)),
      createBookmark(owner.profile.id, visibleMiddle.id, uuid(800)),
      createBookmark(owner.profile.id, hiddenMiddle.id, uuid(750)),
      createBookmark(owner.profile.id, visibleOldest.id, uuid(700)),
    ]);
    await db
      .update(Bookmarks)
      .set({ createdAt: Temporal.Instant.from('2026-07-21T00:00:00Z') })
      .where(eq(Bookmarks.profileId, owner.profile.id));
    const profileId = encodeGlobalId('Profile', owner.profile.id);

    const first = await loadBookmarkConnection(profileId, owner.token, { first: 2 });
    assertNoGraphQLErrors(first);
    assert.deepEqual(
      first.data?.node?.bookmarks.edges.map(({ node }) => node.id),
      [bookmarks[0]!, bookmarks[2]!].map(({ id }) => encodeGlobalId('Bookmark', id)),
    );
    assert.equal(first.data?.node?.bookmarks.pageInfo.hasNextPage, true);

    const second = await loadBookmarkConnection(profileId, owner.token, {
      after: first.data?.node?.bookmarks.pageInfo.endCursor,
      first: 2,
    });
    assertNoGraphQLErrors(second);
    assert.deepEqual(
      second.data?.node?.bookmarks.edges.map(({ node }) => node.id),
      [encodeGlobalId('Bookmark', bookmarks[4]!.id)],
    );
    assert.equal(second.data?.node?.bookmarks.pageInfo.hasNextPage, false);
  });

  test('inherits author Profile, Instance and follower visibility and re-exposes retained rows', async () => {
    const owner = await createAuthenticatedSession();
    const followedAuthor = await createProfile('followed-author');
    const hiddenAuthor = await createProfile('hidden-author');
    const suspendedAuthor = await createProfile('suspended-author');
    const suspendedInstance = await createInstance('suspended.example', InstanceState.SUSPENDED);
    const suspendedInstanceAuthor = await createProfile('suspended-instance-author', {
      instanceId: suspendedInstance.id,
    });
    await db.insert(ProfileFollows).values({
      followeeProfileId: followedAuthor.id,
      followerProfileId: owner.profile.id,
    });

    const followedPost = await createPost(followedAuthor.id, {
      visibility: PostVisibility.FOLLOWERS,
    });
    const hiddenPost = await createPost(hiddenAuthor.id, {
      visibility: PostVisibility.FOLLOWERS,
    });
    const suspendedAuthorPost = await createPost(suspendedAuthor.id);
    const suspendedInstancePost = await createPost(suspendedInstanceAuthor.id);
    await db
      .update(Profiles)
      .set({ state: ProfileState.SUSPENDED })
      .where(eq(Profiles.id, suspendedAuthor.id));

    const followed = await createBookmark(owner.profile.id, followedPost.id, uuid(900));
    const hidden = await createBookmark(owner.profile.id, hiddenPost.id, uuid(800));
    await createBookmark(owner.profile.id, suspendedAuthorPost.id, uuid(700));
    await createBookmark(owner.profile.id, suspendedInstancePost.id, uuid(600));

    const profileId = encodeGlobalId('Profile', owner.profile.id);
    const initial = await loadBookmarkConnection(profileId, owner.token, { first: 10 });
    assertNoGraphQLErrors(initial);
    assert.deepEqual(
      initial.data?.node?.bookmarks.edges.map(({ node }) => node.id),
      [encodeGlobalId('Bookmark', followed.id)],
    );

    const hiddenNodeId = encodeGlobalId('Bookmark', hidden.id);
    assert.deepEqual(await loadBookmarkNodes([hiddenNodeId], owner.token), [
      { id: hiddenNodeId, post: null },
    ]);

    await db.insert(ProfileFollows).values({
      followeeProfileId: hiddenAuthor.id,
      followerProfileId: owner.profile.id,
    });
    const reexposed = await loadBookmarkConnection(profileId, owner.token, { first: 10 });
    assertNoGraphQLErrors(reexposed);
    assert.deepEqual(
      reexposed.data?.node?.bookmarks.edges.map(({ node }) => node.id),
      [followed.id, hidden.id].map((id) => encodeGlobalId('Bookmark', id)),
    );
    assert.deepEqual(await loadBookmarkNodes([hiddenNodeId], owner.token), [
      { id: hiddenNodeId, post: { id: encodeGlobalId('Post', hiddenPost.id) } },
    ]);

    const retained = await db
      .select({ id: Bookmarks.id })
      .from(Bookmarks)
      .where(eq(Bookmarks.profileId, owner.profile.id));
    assert.equal(retained.length, 4);
  });
});

type BookmarkNode = {
  __typename: 'Bookmark';
  createdAt: string;
  id: string;
  post: { id: string } | null;
  profile: { id: string };
};
type BookmarkNodeSummary = { id: string; post: { id: string } | null };
type BookmarkConnection = {
  edges: Array<{ cursor: string; node: BookmarkNodeSummary }>;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
};
type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{
    extensions?: { code?: string; field?: string };
    message: string;
  }>;
};

const bookmarkSelection = `
  __typename
  id
  createdAt
  profile { id }
  post { id }
`;

const requestCreateBookmark = (postId: string, token?: string) =>
  requestGraphQL<{ createBookmark: { bookmark: BookmarkNode } }>(
    `mutation CreateBookmark($input: CreateBookmarkInput!) {
      createBookmark(input: $input) { bookmark { ${bookmarkSelection} } }
    }`,
    { input: { postId: encodeGlobalId('Post', postId) } },
    token,
  );

const requestBookmarkNode = (id: string, token?: string) =>
  requestGraphQL<{ node: BookmarkNode | null }>(
    `query BookmarkNode($id: ID!) {
      node(id: $id) { ... on Bookmark { ${bookmarkSelection} } }
    }`,
    { id },
    token,
  );

const requestGraphQL = async <TData>(
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

const loadBookmarkConnection = (
  id: string,
  token: string | undefined,
  variables: { after?: string | null; first: number },
) =>
  requestGraphQL<{ node: { bookmarks: BookmarkConnection } | null }>(
    `query ProfileBookmarks($id: ID!, $first: Int!, $after: String) {
      node(id: $id) {
        ... on Profile {
          bookmarks(first: $first, after: $after) {
            edges { cursor node { id createdAt post { id } } }
            pageInfo { endCursor hasNextPage }
          }
        }
      }
    }`,
    { id, ...variables },
    token,
  );

const loadBookmarkNodes = async (ids: string[], token?: string) => {
  const result = await requestGraphQL<{ nodes: Array<BookmarkNodeSummary | null> }>(
    `query BookmarkNodes($ids: [ID!]!) {
      nodes(ids: $ids) { ... on Bookmark { id post { id } } }
    }`,
    { ids },
    token,
  );
  assertNoGraphQLErrors(result);
  return result.data!.nodes;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const createInstance = (
  domain: string,
  state: (typeof InstanceState)[keyof typeof InstanceState] = InstanceState.ACTIVE,
) =>
  db
    .insert(Instances)
    .values({ domain, kind: InstanceKind.ACTIVITYPUB, state })
    .returning()
    .then(firstOrThrow);

const createProfile = (
  handle: string,
  {
    instanceId = localInstanceId,
    state = ProfileState.ACTIVE,
  }: { instanceId?: string; state?: ProfileState } = {},
) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createPost = (
  profileId: string,
  {
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: { state?: PostState; visibility?: PostVisibility } = {},
) => db.insert(Posts).values({ profileId, state, visibility }).returning().then(firstOrThrow);

const createBookmark = (profileId: string, postId: string, id?: string) =>
  db.insert(Bookmarks).values({ id, profileId, postId }).returning().then(firstOrThrow);

const createAuthenticatedSession = async ({
  accountState = AccountState.ACTIVE,
  activeProfile = true,
  instanceId = localInstanceId,
  member = true,
  profileState = ProfileState.ACTIVE,
}: {
  accountState?: AccountState;
  activeProfile?: boolean;
  instanceId?: string;
  member?: boolean;
  profileState?: ProfileState;
} = {}) => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: accountState })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(`viewer-${suffix}`, { instanceId, state: profileState });
  if (member) {
    await db.insert(AccountProfiles).values({
      accountId: account.id,
      profileId: profile.id,
      role: AccountProfileRole.OWNER,
    });
  }
  const token = `token-${suffix}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: activeProfile ? profile.id : null,
    state: SessionState.ACTIVE,
    token,
  });

  return { account, profile, token };
};

const countBookmarks = () => db.$count(Bookmarks);

const resetFixtures = async () => {
  await db.delete(Bookmarks);
  await db.delete(Notifications);
  await db.delete(Sessions);
  await db.delete(ProfileFollows);
  await db.delete(Posts);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db.delete(Instances).where(ne(Instances.id, localInstanceId));
};

const truncateDatabase = async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(new Set(['127.0.0.1', '[::1]', 'localhost']).has(databaseUrl.hostname));
  assert.match(databaseUrl.pathname, /^\/kosmo_test(?:_[a-z0-9_]+)?$/);
  await pg.unsafe(`
    DO $$
    DECLARE truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement FROM pg_tables WHERE schemaname = 'public';
      IF truncate_statement IS NOT NULL THEN EXECUTE truncate_statement; END IF;
    END $$;
  `);
};

const uuid = (suffix: number) => `00000000-0000-8006-8000-${suffix.toString().padStart(12, '0')}`;
