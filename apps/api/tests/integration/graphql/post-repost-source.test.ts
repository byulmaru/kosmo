import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { PostState, PostVisibility, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { encodeGlobalId as globalId } from '../../../src/graphql/global-id';
import type * as CoreDb from '@kosmo/core/db';
import type { Env } from '../../../src/context';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL Post Repost Source', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ db, firstOrThrow, Instances, pg, PostContents, Posts, Profiles } =
      await import('@kosmo/core/db'));
    const { seedDatabase } = await import('@kosmo/core/db/seed');

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    const { deriveContext } = await import('../../../src/context');
    const { yoga } = await import('../../../src/graphql');
    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('context', await deriveContext(c));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => {
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await pg.end();
  });

  test('normal Post와 Reply는 Repost Source 없이 null을 반환한다', async () => {
    const profile = await insertProfile();
    const normal = await insertPost({ bodyText: 'normal', profileId: profile.id });
    const reply = await insertPost({
      bodyText: 'reply',
      profileId: profile.id,
      replyParentId: normal.id,
    });

    for (const post of [normal, reply]) {
      const result = await requestRepostSource(post.id);
      assertNoGraphQLErrors(result);
      assert.deepEqual(result.data?.node, {
        __typename: 'Post',
        content: { id: globalId('PostContent', post.currentContentId!) },
        id: globalId('Post', post.id),
        repostSource: null,
      });
    }
  });

  test('content 없는 Repost는 저장된 direct Source를 반환한다', async () => {
    const profile = await insertProfile();
    const source = await insertPost({ bodyText: 'source', profileId: profile.id });
    const repost = await insertPost({ profileId: profile.id, repostSourceId: source.id });

    const result = await requestRepostSource(repost.id);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node, {
      __typename: 'Post',
      content: null,
      id: globalId('Post', repost.id),
      repostSource: { id: globalId('Post', source.id) },
    });
  });

  test('content 있는 Quote는 저장된 direct Source를 반환한다', async () => {
    const profile = await insertProfile();
    const source = await insertPost({ bodyText: 'source', profileId: profile.id });
    const quote = await insertPost({
      bodyText: 'quote',
      profileId: profile.id,
      repostSourceId: source.id,
    });

    const result = await requestRepostSource(quote.id);

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.repostSource?.id, globalId('Post', source.id));
  });

  test('nested Quote는 flattened root 대신 immediate Source를 반환한다', async () => {
    const profile = await insertProfile();
    const root = await insertPost({ bodyText: 'root', profileId: profile.id });
    const source = await insertPost({
      bodyText: 'source',
      profileId: profile.id,
      repostSourceId: root.id,
    });
    const nestedQuote = await insertPost({
      bodyText: 'nested quote',
      profileId: profile.id,
      repostSourceId: source.id,
    });

    const result = await requestRepostSource(nestedQuote.id);

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.repostSource?.id, globalId('Post', source.id));
    assert.notEqual(result.data?.node?.repostSource?.id, globalId('Post', root.id));
  });
});

const insertProfile = () => {
  const handle = `profile-${crypto.randomUUID()}`;
  return db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstanceId,
      normalizedHandle: normalizeHandle(handle),
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
};

const insertPost = async ({
  bodyText,
  profileId,
  replyParentId = null,
  repostSourceId = null,
  visibility = PostVisibility.PUBLIC,
}: {
  bodyText?: string;
  profileId: string;
  replyParentId?: string | null;
  repostSourceId?: string | null;
  visibility?: PostVisibility;
}) => {
  const post = await db
    .insert(Posts)
    .values({
      currentContentId: null,
      profileId,
      replyParentId,
      repostSourceId,
      state: PostState.ACTIVE,
      visibility,
    })
    .returning()
    .then(firstOrThrow);

  if (bodyText == null) {
    return post;
  }

  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText(bodyText), postId: post.id })
    .returning()
    .then(firstOrThrow);

  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const requestRepostSource = (id: string) =>
  requestGraphQL<{ node: PostNode | null }>(
    `query RepostSourceNode($id: ID!) {
      node(id: $id) {
        __typename
        ... on Post {
          id
          content { id }
          repostSource { id }
        }
      }
    }`,
    { id: globalId('Post', id) },
  );

const requestGraphQL = async <TData>(query: string, variables: Record<string, unknown>) => {
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query, variables }),
    headers: new Headers({ 'content-type': 'application/json' }),
    method: 'POST',
  });
  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<TData>;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const truncateDatabase = async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname));
  assert.match(decodeURIComponent(url.pathname.slice(1)), /^kosmo_test(?:_[a-z0-9_]+)?$/);
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

type GraphQLResult<TData> = { data?: TData; errors?: unknown };
type PostNode = {
  __typename: 'Post';
  content: { id: string } | null;
  id: string;
  repostSource: { id: string } | null;
};
