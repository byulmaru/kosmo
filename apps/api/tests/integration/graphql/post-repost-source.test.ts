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
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { encodeGlobalId as globalId } from '../../../src/graphql/global-id';
import type * as CoreDb from '@kosmo/core/db';
import type { Env } from '../../../src/context';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL Post Repost Source', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
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
      Posts,
      ProfileFollows,
      Profiles,
      Sessions,
    } = await import('@kosmo/core/db'));
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
    await db.delete(ProfileFollows);
    await db.delete(Sessions);
    await db.delete(AccountProfiles);
    await db.delete(Accounts);
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

  test('nodes는 Source chain 접근 정책을 적용하면서 입력 순서와 direct Source identity를 보존한다', async () => {
    const profile = await insertProfile();
    const secondProfile = await insertProfile();
    const root = await insertPost({ bodyText: 'visible root', profileId: profile.id });
    const firstQuote = await insertPost({
      bodyText: 'visible first quote',
      profileId: profile.id,
      repostSourceId: root.id,
    });
    const sharedSource = await insertPost({
      bodyText: 'visible shared quote',
      profileId: profile.id,
      repostSourceId: firstQuote.id,
    });
    const nestedQuote = await insertPost({
      bodyText: 'visible nested quote',
      profileId: profile.id,
      repostSourceId: sharedSource.id,
    });
    const sharedRepost = await insertPost({
      bodyText: 'visible shared quote peer',
      profileId: secondProfile.id,
      repostSourceId: sharedSource.id,
    });
    const unavailableRoot = await insertPost({
      bodyText: 'unavailable root',
      profileId: profile.id,
      state: PostState.DELETED,
    });
    const unavailableFirstQuote = await insertPost({
      bodyText: 'unavailable first quote',
      profileId: profile.id,
      repostSourceId: unavailableRoot.id,
    });
    const unavailableSecondQuote = await insertPost({
      bodyText: 'unavailable second quote',
      profileId: profile.id,
      repostSourceId: unavailableFirstQuote.id,
    });
    const unavailableOuter = await insertPost({
      bodyText: 'unavailable outer quote',
      profileId: profile.id,
      repostSourceId: unavailableSecondQuote.id,
    });

    const result = await requestRepostSourceNodes([
      nestedQuote.id,
      unavailableOuter.id,
      sharedRepost.id,
    ]);

    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.nodes, [
      {
        __typename: 'Post',
        id: globalId('Post', nestedQuote.id),
        repostSource: {
          id: globalId('Post', sharedSource.id),
          repostSource: { id: globalId('Post', firstQuote.id) },
        },
      },
      null,
      {
        __typename: 'Post',
        id: globalId('Post', sharedRepost.id),
        repostSource: {
          id: globalId('Post', sharedSource.id),
          repostSource: { id: globalId('Post', firstQuote.id) },
        },
      },
    ]);
  });

  test('author는 자신의 DIRECT Source를 가진 Post Node를 조회할 수 있다', async () => {
    const auth = await createAuthenticatedSession();
    const source = await insertPost({
      bodyText: 'direct source',
      profileId: auth.profile.id,
      visibility: PostVisibility.DIRECT,
    });
    const outer = await insertPost({
      profileId: auth.profile.id,
      repostSourceId: source.id,
    });

    const result = await requestRepostSource(outer.id, auth.token);
    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.repostSource?.id, globalId('Post', source.id));
  });

  test('follower는 FOLLOWERS Source를 가진 Post Node를 조회할 수 있다', async () => {
    const auth = await createAuthenticatedSession();
    const sourceAuthor = await insertProfile();
    await db.insert(ProfileFollows).values({
      followerProfileId: auth.profile.id,
      followeeProfileId: sourceAuthor.id,
    });
    const source = await insertPost({
      bodyText: 'followers source',
      profileId: sourceAuthor.id,
      visibility: PostVisibility.FOLLOWERS,
    });
    const outer = await insertPost({
      profileId: sourceAuthor.id,
      repostSourceId: source.id,
    });

    const result = await requestRepostSource(outer.id, auth.token);
    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node?.repostSource?.id, globalId('Post', source.id));
  });

  test('direct Source Tombstone을 가진 outer Post Node는 반환하지 않는다', async () => {
    const profile = await insertProfile();
    const source = await insertPost({
      bodyText: 'deleted source',
      profileId: profile.id,
      state: PostState.DELETED,
    });
    const outer = await insertPost({ profileId: profile.id, repostSourceId: source.id });

    await assertPostNodeUnavailable(outer.id);
  });

  test('nested Quote의 indirect Source Tombstone을 가진 outer Post Node는 반환하지 않는다', async () => {
    const profile = await insertProfile();
    const deletedSource = await insertPost({
      bodyText: 'deleted source',
      profileId: profile.id,
      state: PostState.DELETED,
    });
    const directSource = await insertPost({
      bodyText: 'direct source quote',
      profileId: profile.id,
      repostSourceId: deletedSource.id,
    });
    const outer = await insertPost({
      bodyText: 'outer quote',
      profileId: profile.id,
      repostSourceId: directSource.id,
    });

    await assertPostNodeUnavailable(outer.id);
  });

  test('unauthorized viewer에게 DIRECT direct Source를 가진 outer Post Node는 반환하지 않는다', async () => {
    const profile = await insertProfile();
    const source = await insertPost({
      bodyText: 'direct source',
      profileId: profile.id,
      visibility: PostVisibility.DIRECT,
    });
    const outer = await insertPost({ profileId: profile.id, repostSourceId: source.id });

    await assertPostNodeUnavailable(outer.id);
  });

  test('indirect Source author의 suspended Instance를 가진 outer Post Node는 반환하지 않는다', async () => {
    const profile = await insertProfile();
    const suspendedInstance = await insertSuspendedInstance();
    const sourceAuthor = await insertProfile({ instanceId: suspendedInstance.id });
    const indirectSource = await insertPost({
      bodyText: 'suspended source',
      profileId: sourceAuthor.id,
    });
    const directSource = await insertPost({
      bodyText: 'direct source quote',
      profileId: profile.id,
      repostSourceId: indirectSource.id,
    });
    const outer = await insertPost({
      bodyText: 'outer quote',
      profileId: profile.id,
      repostSourceId: directSource.id,
    });

    await assertPostNodeUnavailable(outer.id);
  });

  test('contentless pure Repost Source를 가진 outer Post Node는 반환하지 않는다', async () => {
    const profile = await insertProfile();
    const root = await insertPost({ bodyText: 'root', profileId: profile.id });
    const contentlessRepost = await insertPost({
      profileId: profile.id,
      repostSourceId: root.id,
    });
    const outer = await insertPost({
      bodyText: 'outer quote',
      profileId: profile.id,
      repostSourceId: contentlessRepost.id,
    });

    await assertPostNodeUnavailable(outer.id);
  });

  test('cycle이 생긴 Source chain을 가진 outer Post Node는 반환하지 않는다', async () => {
    const profile = await insertProfile();
    const firstQuote = await insertPost({ bodyText: 'first quote', profileId: profile.id });
    const secondQuote = await insertPost({
      bodyText: 'second quote',
      profileId: profile.id,
      repostSourceId: firstQuote.id,
    });
    await db
      .update(Posts)
      .set({ repostSourceId: secondQuote.id })
      .where(eq(Posts.id, firstQuote.id));
    const outer = await insertPost({
      bodyText: 'outer quote',
      profileId: profile.id,
      repostSourceId: firstQuote.id,
    });

    await assertPostNodeUnavailable(outer.id);
  });
});

const insertProfile = ({ instanceId = localInstanceId }: { instanceId?: string } = {}) => {
  const handle = `profile-${crypto.randomUUID()}`;
  return db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
};

const insertSuspendedInstance = () => {
  const domain = `suspended-${crypto.randomUUID()}.example`;
  return db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.SUSPENDED,
    })
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
  const profile = await insertProfile();
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

const insertPost = async ({
  bodyText,
  profileId,
  replyParentId = null,
  repostSourceId = null,
  state = PostState.ACTIVE,
  visibility = PostVisibility.PUBLIC,
}: {
  bodyText?: string;
  profileId: string;
  replyParentId?: string | null;
  repostSourceId?: string | null;
  state?: PostState;
  visibility?: PostVisibility;
}) => {
  const post = await db
    .insert(Posts)
    .values({
      currentContentId: null,
      profileId,
      replyParentId,
      repostSourceId,
      state,
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

const requestRepostSource = (id: string, token?: string) =>
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
    token,
  );

const requestRepostSourceNodes = (ids: string[]) =>
  requestGraphQL<{ nodes: Array<PostRepostSourceNode | null> }>(
    `query RepostSourceNodes($ids: [ID!]!) {
      nodes(ids: $ids) {
        __typename
        ... on Post {
          id
          repostSource {
            id
            repostSource { id }
          }
        }
      }
    }`,
    { ids: ids.map((id) => globalId('Post', id)) },
  );

const assertPostNodeUnavailable = async (postId: string, token?: string) => {
  const result = await requestGraphQL<{ node: { id: string } | null }>(
    'query PostNode($id: ID!) { node(id: $id) { ... on Post { id } } }',
    { id: globalId('Post', postId) },
    token,
  );
  assertNoGraphQLErrors(result);
  assert.equal(result.data?.node, null);
};

const requestGraphQL = async <TData>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
) => {
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
type PostRepostSourceNode = {
  __typename: 'Post';
  id: string;
  repostSource: {
    id: string;
    repostSource: { id: string } | null;
  } | null;
};
