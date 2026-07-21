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
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { encodeGlobalId as globalId } from '../../../src/graphql/global-id';
import type * as CoreDb from '@kosmo/core/db';
import type { Env } from '../../../src/context';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let pg: typeof CoreDb.pg;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let Sessions: typeof CoreDb.Sessions;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL Reaction 추가', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ AccountProfiles, Accounts, db, firstOrThrow, pg, Posts, Profiles, Reactions, Sessions } =
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

  test('반복 add가 같은 Reaction Node를 반환하고 created를 노출하지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);

    const first = await requestAddReaction(post.id, '❤️', auth.token);
    const second = await requestAddReaction(post.id, '❤️', auth.token);

    assertNoGraphQLErrors(first);
    assertNoGraphQLErrors(second);
    assert.deepEqual(second.data?.addReaction.reaction, first.data?.addReaction.reaction);
    const stored = await db
      .select()
      .from(Reactions)
      .where(eq(Reactions.postId, post.id))
      .then(firstOrThrow);
    assert.deepEqual(first.data?.addReaction.reaction, {
      __typename: 'Reaction',
      createdAt: first.data?.addReaction.reaction.createdAt,
      id: globalId('Reaction', stored.id),
      type: '❤️',
    });
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .where(eq(Reactions.postId, post.id))
        .then((rows) => rows.length),
      1,
    );
  });

  test('허용되지 않은 Type은 VALIDATION과 field type으로 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);

    const result = await requestAddReaction(post.id, '👍', auth.token);

    assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(result.errors?.[0]?.extensions?.field, 'type');
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .then((rows) => rows.length),
      0,
    );
  });

  test('누락되거나 조회할 수 없는 Post는 같은 NOT_FOUND로 숨긴다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('private-author');
    const hiddenPost = await createPost(author.id, PostVisibility.DIRECT);

    for (const postId of [hiddenPost.id, crypto.randomUUID()]) {
      const result = await requestAddReaction(postId, '👀', auth.token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    }
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .then((rows) => rows.length),
      0,
    );
  });

  test('Post가 아닌 concrete global ID를 mutation input에서 거부한다', async () => {
    const auth = await createAuthenticatedSession();
    const result = await requestGraphQL<{ addReaction: { reaction: ReactionNode } }>(
      `mutation AddReaction($input: AddReactionInput!) {
        addReaction(input: $input) { reaction { id } }
      }`,
      {
        input: {
          postId: globalId('Profile', auth.profile.id),
          type: '🥹',
        },
      },
      auth.token,
    );

    assert.ok(result.errors?.[0]);
    assert.equal(
      await db
        .select()
        .from(Reactions)
        .then((rows) => rows.length),
      0,
    );
  });

  test('인증되었지만 active Profile이 없거나 비로그인인 요청은 거부한다', async () => {
    const auth = await createAuthenticatedSession({ activeProfile: false });
    const post = await createPost(auth.profile.id);

    for (const token of [auth.token, undefined]) {
      const result = await requestAddReaction(post.id, '🎉', token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }
  });

  test('Reaction Node는 Post 조회 정책을 그대로 적용한다', async () => {
    const auth = await createAuthenticatedSession();
    const post = await createPost(auth.profile.id);
    const added = await requestAddReaction(post.id, '🌈', auth.token);
    const reactionId = added.data?.addReaction.reaction.id;
    assert.ok(reactionId);

    const publicNode = await requestNode(reactionId);
    assertNoGraphQLErrors(publicNode);
    assert.equal(publicNode.data?.node?.type, '🌈');

    await db.update(Posts).set({ visibility: PostVisibility.DIRECT }).where(eq(Posts.id, post.id));
    const hiddenNode = await requestNode(reactionId);
    assertNoGraphQLErrors(hiddenNode);
    assert.equal(hiddenNode.data?.node, null);
  });
});

type ReactionNode = {
  __typename: 'Reaction';
  createdAt: string;
  id: string;
  type: string;
};

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{
    extensions?: { code?: string; field?: string };
    message: string;
  }>;
};

const requestAddReaction = (postId: string, type: string, token?: string) =>
  requestGraphQL<{ addReaction: { reaction: ReactionNode } }>(
    `mutation AddReaction($input: AddReactionInput!) {
      addReaction(input: $input) {
        reaction { __typename id type createdAt }
      }
    }`,
    { input: { postId: globalId('Post', postId), type } },
    token,
  );

const requestNode = (id: string) =>
  requestGraphQL<{ node: { type: string } | null }>(
    `query ReactionNode($id: ID!) {
      node(id: $id) { ... on Reaction { type } }
    }`,
    { id },
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

const createPost = (profileId: string, visibility: PostVisibility = PostVisibility.PUBLIC) =>
  db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);

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
  return { profile, token };
};

const resetFixtures = async () => {
  await db.delete(Reactions);
  await db.delete(Posts);
  await db.delete(Sessions);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
};

const truncateDatabase = async () => {
  assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, '/kosmo_test');
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
