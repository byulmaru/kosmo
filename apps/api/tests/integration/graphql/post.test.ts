import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { PostState, PostVisibility, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
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
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let encodeGlobalId: typeof EncodeGlobalId;
let app: Hono<Env>;
let localInstanceId: string;

describe('Post Reply Parent GraphQL 경계', () => {
  before(async () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ db, firstOrThrow, Instances, pg, PostContents, Posts, Profiles } =
      await import('@kosmo/core/db'));
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

const requestGraphQL = async <TData>(
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphQLResult<TData>> => {
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
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
    replyParentId,
    repostSourceId,
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: {
    replyParentId?: string;
    repostSourceId?: string;
    state?: PostState;
    visibility?: PostVisibility;
  } = {},
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, replyParentId, repostSourceId, state, visibility })
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

const resetFixtures = async () => {
  await db.update(Posts).set({ currentContentId: null, replyParentId: null, repostSourceId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
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
