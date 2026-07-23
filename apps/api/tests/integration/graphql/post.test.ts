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
import { normalizeHandle } from '@kosmo/core/utils';
import { eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';
import type { encodeGlobalId as EncodeGlobalId } from '../../../src/graphql/global-id';

const publicOrigin = 'http://127.0.0.1:4173';
process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof CoreDb.db;
let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let encodeGlobalId: typeof EncodeGlobalId;
let app: Hono<Env>;
let localInstanceId: string;

describe('Post Reply GraphQL 경계', () => {
  before(async () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      AccountProfiles,
      Accounts,
      db,
      firstOrThrow,
      Instances,
      pg,
      PostContents,
      ProfileFollows,
      Posts,
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

  test('일반 Reply와 Reply+Quote는 저장된 직접 Parent를 기존 Post Node로 반환한다', async () => {
    const author = await createProfile('reply-author');
    const parent = await createContentfulPost(author.id);
    const source = await createContentfulPost(author.id);
    const postWithoutParent = await createContentfulPost(author.id);
    const reply = await createContentfulPost(author.id, { replyParentId: parent.id });
    const replyQuote = await createContentfulPost(author.id, {
      replyParentId: parent.id,
      repostSourceId: source.id,
    });

    const withoutParent = await requestPostNode(postWithoutParent.id);
    const visibleReply = await requestPostNode(reply.id);
    const visibleReplyQuote = await requestPostNode(replyQuote.id);

    assertNoGraphQLErrors(withoutParent);
    assertNoGraphQLErrors(visibleReply);
    assertNoGraphQLErrors(visibleReplyQuote);
    assert.deepEqual(withoutParent.data?.node, {
      id: encodeGlobalId('Post', postWithoutParent.id),
      replyParent: null,
    });
    for (const [result, postId] of [
      [visibleReply, reply.id],
      [visibleReplyQuote, replyQuote.id],
    ] as const) {
      assert.deepEqual(result.data?.node, {
        id: encodeGlobalId('Post', postId),
        replyParent: { id: encodeGlobalId('Post', parent.id) },
      });
    }
  });

  test('조회 불가능한 Parent는 직접 Node와 관계에서 숨기고 현재 Reply는 유지한다', async () => {
    const childAuthor = await createProfile('child-author');
    const hiddenAuthor = await createProfile('hidden-author');
    const suspendedAuthor = await createProfile('suspended-author', ProfileState.SUSPENDED);
    const hiddenParent = await createContentfulPost(hiddenAuthor.id, {
      visibility: PostVisibility.DIRECT,
    });
    const tombstoneParent = await createContentfulPost(hiddenAuthor.id, {
      state: PostState.DELETED,
    });
    const suspendedAuthorParent = await createContentfulPost(suspendedAuthor.id);

    for (const parent of [hiddenParent, tombstoneParent, suspendedAuthorParent]) {
      const reply = await createContentfulPost(childAuthor.id, { replyParentId: parent.id });
      const result = await requestPostAndParent(reply.id, parent.id);

      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data, {
        parent: null,
        reply: {
          id: encodeGlobalId('Post', reply.id),
          replyParent: null,
        },
      });
    }
  });

  test('Reply Parent가 없으면 조상 경로는 빈 배열이다', async () => {
    const author = await createProfile('ancestor-empty-author');
    const post = await createContentfulPost(author.id);

    const result = await requestPostAncestors(post.id);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      id: encodeGlobalId('Post', post.id),
      replyAncestors: [],
    });
  });

  test('Reply와 Reply+Quote 조상은 직접 Parent부터 root 방향으로 반환한다', async () => {
    const author = await createProfile('ancestor-order-author');
    const root = await createContentfulPost(author.id);
    const source = await createContentfulPost(author.id);
    const replyQuote = await createContentfulPost(author.id, {
      replyParentId: root.id,
      repostSourceId: source.id,
    });
    const reply = await createContentfulPost(author.id, { replyParentId: replyQuote.id });

    const result = await requestPostAncestors(reply.id);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      id: encodeGlobalId('Post', reply.id),
      replyAncestors: [replyQuote.id, root.id].map((id) => ({
        id: encodeGlobalId('Post', id),
      })),
    });
  });

  test('조회 불가능한 중간 Parent에서 조상 경로를 중단하고 그 위를 노출하지 않는다', async () => {
    const author = await createProfile('ancestor-boundary-author');
    const root = await createContentfulPost(author.id);
    const boundaries = [
      await createContentfulPost(author.id, {
        replyParentId: root.id,
        visibility: PostVisibility.DIRECT,
      }),
      await createContentfulPost(author.id, {
        replyParentId: root.id,
        state: PostState.DELETED,
      }),
    ];

    for (const boundary of boundaries) {
      const visibleParent = await createContentfulPost(author.id, {
        replyParentId: boundary.id,
      });
      const reply = await createContentfulPost(author.id, {
        replyParentId: visibleParent.id,
      });

      const result = await requestPostAncestors(reply.id);

      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.node, {
        id: encodeGlobalId('Post', reply.id),
        replyAncestors: [{ id: encodeGlobalId('Post', visibleParent.id) }],
      });
    }
  });

  test('비정상 cycle에서도 현재 Post와 같은 조상을 반복 노출하지 않는다', async () => {
    const author = await createProfile('ancestor-cycle-author');
    const current = await createContentfulPost(author.id);
    const directParent = await createContentfulPost(author.id);
    const grandparent = await createContentfulPost(author.id);

    await db.update(Posts).set({ replyParentId: directParent.id }).where(eq(Posts.id, current.id));
    await db
      .update(Posts)
      .set({ replyParentId: grandparent.id })
      .where(eq(Posts.id, directParent.id));
    await db.update(Posts).set({ replyParentId: current.id }).where(eq(Posts.id, grandparent.id));

    const result = await requestPostAncestors(current.id);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      id: encodeGlobalId('Post', current.id),
      replyAncestors: [directParent.id, grandparent.id].map((id) => ({
        id: encodeGlobalId('Post', id),
      })),
    });
  });

  test('100단계를 넘는 정상 조상 경로도 단일 조회로 임의 절단 없이 반환한다', async (t) => {
    const author = await createProfile('ancestor-depth-author');
    const root = await createContentfulPost(author.id);
    const pathFromRoot = [root];

    for (let depth = 0; depth < 100; depth += 1) {
      pathFromRoot.push(
        await createContentfulPost(author.id, {
          replyParentId: pathFromRoot.at(-1)!.id,
        }),
      );
    }

    const reply = await createContentfulPost(author.id, {
      replyParentId: pathFromRoot.at(-1)!.id,
    });
    const executeMock = t.mock.method(db, 'execute');

    const result = await requestPostAncestors(reply.id);

    assertNoGraphQLErrors(result);
    assert.equal(executeMock.mock.callCount(), 1);
    assert.deepEqual(result.data?.node, {
      id: encodeGlobalId('Post', reply.id),
      replyAncestors: [...pathFromRoot].reverse().map(({ id }) => ({
        id: encodeGlobalId('Post', id),
      })),
    });
  });

  test('직접·간접 Reply와 Reply+Quote descendant를 시간순으로 반환한다', async () => {
    const author = await createProfile('descendant-author');
    const root = await createContentfulPost(author.id);
    const source = await createContentfulPost(author.id);
    const direct = await createContentfulPost(author.id, {
      createdAt: Temporal.Instant.from('2026-07-23T00:00:02Z'),
      id: uuid(20),
      replyParentId: root.id,
    });
    const nested = await createContentfulPost(author.id, {
      createdAt: Temporal.Instant.from('2026-07-23T00:00:03Z'),
      id: uuid(30),
      replyParentId: direct.id,
    });
    const replyQuote = await createContentfulPost(author.id, {
      createdAt: Temporal.Instant.from('2026-07-23T00:00:01Z'),
      id: uuid(10),
      replyParentId: root.id,
      repostSourceId: source.id,
    });
    await createContentfulPost(author.id);

    const result = await requestReplyDescendants(root.id, { first: 10 });

    assertReplyDescendantIds(result, [replyQuote.id, direct.id, nested.id]);
  });

  test('조회 불가능한 Source와 무관하게 Reply+Quote descendant와 자체 Content를 유지한다', async () => {
    const author = await createProfile('unavailable-source-author');
    const root = await createContentfulPost(author.id);
    const source = await createContentfulPost(author.id);
    const replyQuote = await createContentfulPost(author.id, {
      replyParentId: root.id,
      repostSourceId: source.id,
    });
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, source.id));

    const result = await requestReplyDescendants(root.id, { first: 10 });

    assertReplyDescendantIds(result, [replyQuote.id]);
    assert.deepEqual(result.data?.node?.replyDescendants.edges[0]?.node.content, {
      bodyText: replyQuote.id,
    });
  });

  test('숨겨진 Parent와 ineligible Parent 아래의 visible descendant를 filter-before-limit으로 유지한다', async () => {
    const rootAuthor = await createProfile('boundary-root-author');
    const hiddenAuthor = await createProfile('boundary-hidden-author');
    const suspendedAuthor = await createProfile(
      'boundary-suspended-author',
      ProfileState.SUSPENDED,
    );
    const visibleAuthor = await createProfile('boundary-visible-author');
    const root = await createContentfulPost(rootAuthor.id);
    const hiddenParent = await createContentfulPost(hiddenAuthor.id, {
      createdAt: Temporal.Instant.from('2026-07-23T00:00:01Z'),
      replyParentId: root.id,
      visibility: PostVisibility.DIRECT,
    });
    const visibleUnderHidden = await createContentfulPost(visibleAuthor.id, {
      createdAt: Temporal.Instant.from('2026-07-23T00:00:02Z'),
      replyParentId: hiddenParent.id,
    });
    const suspendedParent = await createContentfulPost(suspendedAuthor.id, {
      createdAt: Temporal.Instant.from('2026-07-23T00:00:03Z'),
      replyParentId: root.id,
    });
    const visibleUnderSuspended = await createContentfulPost(visibleAuthor.id, {
      createdAt: Temporal.Instant.from('2026-07-23T00:00:04Z'),
      replyParentId: suspendedParent.id,
    });
    const visibleLast = await createContentfulPost(visibleAuthor.id, {
      createdAt: Temporal.Instant.from('2026-07-23T00:00:05Z'),
      replyParentId: root.id,
    });

    const first = await requestReplyDescendants(root.id, { first: 2 });
    assertReplyDescendantIds(first, [visibleUnderHidden.id, visibleUnderSuspended.id]);
    assert.equal(first.data?.node?.replyDescendants.pageInfo.hasNextPage, true);

    const second = await requestReplyDescendants(root.id, {
      after: first.data?.node?.replyDescendants.pageInfo.endCursor,
      first: 2,
    });
    assertReplyDescendantIds(second, [visibleLast.id]);
    assert.equal(second.data?.node?.replyDescendants.pageInfo.hasNextPage, false);
  });

  test('viewer별 Followers visibility를 각 descendant에 독립 적용한다', async () => {
    const viewer = await createAuthenticatedSession();
    const rootAuthor = await createProfile('viewer-root-author');
    const followedAuthor = await createProfile('viewer-followed-author');
    const hiddenAuthor = await createProfile('viewer-hidden-author');
    const root = await createContentfulPost(rootAuthor.id);
    const followedReply = await createContentfulPost(followedAuthor.id, {
      replyParentId: root.id,
      visibility: PostVisibility.FOLLOWERS,
    });
    await createContentfulPost(hiddenAuthor.id, {
      replyParentId: root.id,
      visibility: PostVisibility.FOLLOWERS,
    });
    await db.insert(ProfileFollows).values({
      followeeProfileId: followedAuthor.id,
      followerProfileId: viewer.profile.id,
    });

    const authenticated = await requestReplyDescendants(root.id, { first: 10 }, viewer.token);
    assertReplyDescendantIds(authenticated, [followedReply.id]);

    const anonymous = await requestReplyDescendants(root.id, { first: 10 });
    assertReplyDescendantIds(anonymous, []);
  });

  test('같은 생성 시각을 ID로 안정 정렬하고 양방향 Relay page를 제공한다', async () => {
    const author = await createProfile('pagination-author');
    const root = await createContentfulPost(author.id);
    const createdAt = Temporal.Instant.from('2026-07-23T00:00:00Z');
    const descendants = await Promise.all(
      [10, 20, 30, 40].map((suffix) =>
        createContentfulPost(author.id, {
          createdAt,
          id: uuid(suffix),
          replyParentId: root.id,
        }),
      ),
    );

    const first = await requestReplyDescendants(root.id, { first: 2 });
    assertReplyDescendantIds(
      first,
      descendants.slice(0, 2).map(({ id }) => id),
    );
    const firstConnection = first.data?.node?.replyDescendants;
    assert.ok(firstConnection);
    assert.equal(firstConnection.pageInfo.hasNextPage, true);
    assert.equal(firstConnection.pageInfo.hasPreviousPage, false);
    assert.notEqual(firstConnection.pageInfo.endCursor, descendants[1]?.id);
    assert.doesNotMatch(firstConnection.pageInfo.endCursor ?? '', /2026-07-23/);

    const second = await requestReplyDescendants(root.id, {
      after: firstConnection.pageInfo.endCursor,
      first: 2,
    });
    assertReplyDescendantIds(
      second,
      descendants.slice(2).map(({ id }) => id),
    );
    const secondConnection = second.data?.node?.replyDescendants;
    assert.ok(secondConnection);
    assert.equal(secondConnection.pageInfo.hasNextPage, false);
    assert.equal(secondConnection.pageInfo.hasPreviousPage, true);

    const backward = await requestReplyDescendants(root.id, {
      before: secondConnection.pageInfo.startCursor,
      last: 2,
    });
    assertReplyDescendantIds(
      backward,
      descendants.slice(0, 2).map(({ id }) => id),
    );
    assert.equal(backward.data?.node?.replyDescendants.pageInfo.hasNextPage, true);
    assert.equal(backward.data?.node?.replyDescendants.pageInfo.hasPreviousPage, false);

    const invalid = await requestReplyDescendants(root.id, { after: 'not+a+cursor', first: 1 });
    assert.equal(invalid.errors?.[0]?.message, 'Invalid Reply Descendant cursor');
  });

  test('비정상 cycle에서도 root를 descendant로 반복하지 않고 유한하게 종료한다', async () => {
    const author = await createProfile('cycle-author');
    const root = await createContentfulPost(author.id);
    const first = await createContentfulPost(author.id, { replyParentId: root.id });
    const second = await createContentfulPost(author.id, { replyParentId: first.id });
    await db.update(Posts).set({ replyParentId: second.id }).where(eq(Posts.id, root.id));

    const result = await requestReplyDescendants(root.id, { first: 10 });

    assertReplyDescendantIds(result, [first.id, second.id]);
  });
});

type PostNode = {
  id: string;
  replyParent: { id: string } | null;
};

type PostAncestorsNode = {
  id: string;
  replyAncestors: Array<{ id: string }>;
};

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{ message: string }>;
};

type ReplyDescendantConnection = {
  edges: Array<{
    cursor: string;
    node: { content: { bodyText: string } | null; id: string };
  }>;
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
  };
};

const requestPostNode = (postId: string) =>
  requestGraphQL<{ node: PostNode | null }>(
    `query PostReplyParent($postId: ID!) {
      node(id: $postId) {
        ... on Post { id replyParent { id } }
      }
    }`,
    { postId: encodeGlobalId('Post', postId) },
  );

const requestPostAndParent = (postId: string, parentId: string) =>
  requestGraphQL<{ parent: { id: string } | null; reply: PostNode | null }>(
    `query PostReplyParentBoundary($postId: ID!, $parentId: ID!) {
      reply: node(id: $postId) {
        ... on Post { id replyParent { id } }
      }
      parent: node(id: $parentId) {
        ... on Post { id }
      }
    }`,
    {
      parentId: encodeGlobalId('Post', parentId),
      postId: encodeGlobalId('Post', postId),
    },
  );

const requestPostAncestors = (postId: string) =>
  requestGraphQL<{ node: PostAncestorsNode | null }>(
    `query PostReplyAncestors($postId: ID!) {
      node(id: $postId) {
        ... on Post { id replyAncestors { id } }
      }
    }`,
    { postId: encodeGlobalId('Post', postId) },
  );

const requestReplyDescendants = (
  postId: string,
  variables: {
    after?: string | null;
    before?: string | null;
    first?: number | null;
    last?: number | null;
  },
  token?: string,
) =>
  requestGraphQL<{ node: { replyDescendants: ReplyDescendantConnection } | null }>(
    `query PostReplyDescendants(
      $postId: ID!
      $first: Int
      $after: String
      $last: Int
      $before: String
    ) {
      node(id: $postId) {
        ... on Post {
          replyDescendants(first: $first, after: $after, last: $last, before: $before) {
            edges { cursor node { id content { bodyText } } }
            pageInfo { endCursor hasNextPage hasPreviousPage startCursor }
          }
        }
      }
    }`,
    { postId: encodeGlobalId('Post', postId), ...variables },
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

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const assertReplyDescendantIds = (
  result: GraphQLResult<{ node: { replyDescendants: ReplyDescendantConnection } | null }>,
  expected: string[],
) => {
  assertNoGraphQLErrors(result);
  assert.deepEqual(
    result.data?.node?.replyDescendants.edges.map(({ node }) => node.id),
    expected.map((id) => encodeGlobalId('Post', id)),
  );
};

const createProfile = (handle: string, state: ProfileState = ProfileState.ACTIVE) =>
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

const createContentfulPost = async (
  profileId: string,
  {
    createdAt,
    id,
    replyParentId,
    repostSourceId,
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: {
    createdAt?: Temporal.Instant;
    id?: string;
    replyParentId?: string;
    repostSourceId?: string;
    state?: PostState;
    visibility?: PostVisibility;
  } = {},
) => {
  const post = await db
    .insert(Posts)
    .values({ createdAt, id, profileId, replyParentId, repostSourceId, state, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({
      document: {
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: post.id }] }],
        },
      },
      postId: post.id,
    })
    .returning()
    .then(firstOrThrow);

  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const createAuthenticatedSession = async () => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile(`viewer-${suffix}`);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const token = `token-${suffix}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: profile.id,
    state: SessionState.ACTIVE,
    token,
  });

  return { profile, token };
};

const resetFixtures = async () => {
  await db.update(Posts).set({ currentContentId: null, replyParentId: null, repostSourceId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(ProfileFollows);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
  await db.delete(Instances).where(ne(Instances.id, localInstanceId));
};

const truncateDatabase = async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(databaseUrl.hostname));
  assert.match(decodeURIComponent(databaseUrl.pathname.slice(1)), /^kosmo_test(?:_[a-z0-9_]+)?$/);
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
