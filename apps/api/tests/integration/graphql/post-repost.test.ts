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
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { eq } from 'drizzle-orm';
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
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL Repost', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ AccountProfiles, Accounts, db, firstOrThrow, pg, PostContents, Posts, Profiles, Sessions } =
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
    await resetFixtures();
  });

  after(async () => {
    await pg.end();
  });

  test('반복·동시 repostPost가 같은 Repost Post payload를 반환한다', async () => {
    const auth = await createAuthenticatedSession();
    const source = await createContentPost(auth.profile.id);

    const first = await requestRepost(source.id, auth.token);
    const repeated = await requestRepost(source.id, auth.token);
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => requestRepost(source.id, auth.token)),
    );

    assertNoGraphQLErrors(first);
    assertNoGraphQLErrors(repeated);
    concurrent.forEach(assertNoGraphQLErrors);
    assert.deepEqual(repeated.data?.repostPost.repost, first.data?.repostPost.repost);
    assert.deepEqual(
      concurrent.map((result) => result.data?.repostPost.repost.id),
      Array.from({ length: 4 }, () => first.data?.repostPost.repost.id),
    );

    const stored = await db.select().from(Posts).where(eq(Posts.repostSourceId, source.id));
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.currentContentId, null);
    assert.equal(stored[0]?.profileId, auth.profile.id);
    assert.deepEqual(first.data?.repostPost.repost, {
      __typename: 'Post',
      id: globalId('Post', stored[0]!.id),
      state: 'ACTIVE',
      visibility: 'UNLISTED',
    });
  });

  test('조회 가능한 허용 불가 Source는 VALIDATION sourceId로 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const contentSource = await createContentPost(auth.profile.id);
    const contentlessSource = await db
      .insert(Posts)
      .values({
        profileId: auth.profile.id,
        repostSourceId: contentSource.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);

    const result = await requestRepost(contentlessSource.id, auth.token);

    assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(result.errors?.[0]?.extensions?.field, 'sourceId');
    assert.equal(
      await db
        .select()
        .from(Posts)
        .where(eq(Posts.repostSourceId, contentlessSource.id))
        .then((rows) => rows.length),
      0,
    );
  });

  test('누락되거나 조회할 수 없는 Source는 같은 NOT_FOUND로 숨긴다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('hidden-author');
    const hiddenSource = await createContentPost(author.id, PostVisibility.FOLLOWERS);

    for (const sourceId of [hiddenSource.id, crypto.randomUUID()]) {
      const result = await requestRepost(sourceId, auth.token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    }
  });

  test('비로그인·active Profile 부재·비활성 Account·membership 부재를 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const source = await createContentPost(auth.profile.id);
    const noActiveProfile = await createAuthenticatedSession({ activeProfile: false });

    for (const token of [undefined, noActiveProfile.token]) {
      const result = await requestRepost(source.id, token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }

    await db
      .update(Accounts)
      .set({ state: AccountState.DISABLED })
      .where(eq(Accounts.id, auth.account.id));
    assert.equal(
      (await requestRepost(source.id, auth.token)).errors?.[0]?.extensions?.code,
      'PERMISSION_DENIED',
    );

    await db
      .update(Accounts)
      .set({ state: AccountState.ACTIVE })
      .where(eq(Accounts.id, auth.account.id));
    await db.delete(AccountProfiles).where(eq(AccountProfiles.accountId, auth.account.id));
    assert.equal(
      (await requestRepost(source.id, auth.token)).errors?.[0]?.extensions?.code,
      'PERMISSION_DENIED',
    );
  });

  test('Post가 아닌 concrete global ID를 sourceId에서 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const result = await requestGraphQL<{ repostPost: { repost: PostNode } }>(
      `mutation RepostPost($input: RepostPostInput!) {
        repostPost(input: $input) { repost { id } }
      }`,
      { input: { sourceId: globalId('Profile', auth.profile.id) } },
      auth.token,
    );

    assert.ok(result.errors?.[0]);
  });
});

type PostNode = {
  __typename: 'Post';
  id: string;
  state: string;
  visibility: string;
};

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{
    extensions?: { code?: string; field?: string };
    message: string;
  }>;
};

const requestRepost = (sourceId: string, token?: string) =>
  requestGraphQL<{ repostPost: { repost: PostNode } }>(
    `mutation RepostPost($input: RepostPostInput!) {
      repostPost(input: $input) {
        repost { __typename id visibility state }
      }
    }`,
    { input: { sourceId: globalId('Post', sourceId) } },
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

const createProfile = (handle: string) =>
  db
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

const createContentPost = async (
  profileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText(crypto.randomUUID()),
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

const createAuthenticatedSession = async ({
  activeProfile = true,
}: { activeProfile?: boolean } = {}) => {
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
    activeProfileId: activeProfile ? profile.id : null,
    state: SessionState.ACTIVE,
    token,
  });

  return { account, profile, token };
};

const resetFixtures = async () => {
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
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
