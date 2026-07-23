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
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';
import type { encodeGlobalId as EncodeGlobalId } from '../../../src/graphql/global-id';

const publicOrigin = 'http://127.0.0.1:4173';
process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let encodeGlobalId: typeof EncodeGlobalId;
let app: Hono<Env>;
let localInstanceId: string;

describe('GraphQL Local Reply 생성', () => {
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

  test('replyParentId 생략은 기존 일반 Post 계약을 유지한다', async () => {
    const auth = await createAuthenticatedSession();

    const result = await requestCreatePost(
      { bodyText: '일반 게시글', visibility: PostVisibility.UNLISTED },
      auth.token,
    );

    assertNoGraphQLErrors(result);
    const stored = await db.select().from(Posts).then(firstOrThrow);
    const content = await db
      .select()
      .from(PostContents)
      .where(eq(PostContents.postId, stored.id))
      .then(firstOrThrow);
    assert.deepEqual(result.data?.createPost.post, {
      __typename: 'Post',
      id: encodeGlobalId('Post', stored.id),
      state: PostState.ACTIVE,
      visibility: PostVisibility.UNLISTED,
    });
    assert.equal(stored.currentContentId, content.id);
    assert.equal(stored.replyParentId, null);
    assert.equal(stored.repostSourceId, null);
  });

  test('조회 가능한 일반 Post·Reply·Quote를 Parent로 하고 독립 Visibility를 저장한다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('parent-author');
    const source = await createContentPost(author.id, { bodyText: 'source' });
    const parent = await createContentPost(author.id, {
      bodyText: 'parent',
      visibility: PostVisibility.PUBLIC,
    });
    const parentReply = await createContentPost(author.id, {
      bodyText: 'parent reply',
      replyParentId: parent.id,
    });
    const quoteParent = await createContentPost(author.id, {
      bodyText: 'quote parent',
      repostSourceId: source.id,
    });

    for (const replyParent of [parent, parentReply, quoteParent]) {
      const result = await requestCreatePost(
        {
          bodyText: `reply-${replyParent.id}`,
          replyParentId: encodeGlobalId('Post', replyParent.id),
          visibility: PostVisibility.FOLLOWERS,
        },
        auth.token,
      );

      assertNoGraphQLErrors(result);
      const id = result.data?.createPost.post.id;
      assert.ok(id);
      const stored = await db
        .select()
        .from(Posts)
        .where(and(eq(Posts.profileId, auth.profile.id), eq(Posts.replyParentId, replyParent.id)))
        .then(firstOrThrow);
      assert.equal(id, encodeGlobalId('Post', stored.id));
      assert.equal(stored.profileId, auth.profile.id);
      assert.equal(stored.replyParentId, replyParent.id);
      assert.equal(stored.visibility, PostVisibility.FOLLOWERS);
      assert.ok(stored.currentContentId);
      assert.equal(stored.repostSourceId, null);
    }
  });

  test('없거나 조회할 수 없거나 삭제된 Parent는 같은 NOT_FOUND로 숨기고 rollback한다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('hidden-parent-author');
    const hidden = await createContentPost(author.id, { visibility: PostVisibility.DIRECT });
    const deleted = await createContentPost(author.id, { state: PostState.DELETED });
    const before = await db.$count(Posts);

    for (const parentId of [hidden.id, deleted.id, crypto.randomUUID()]) {
      const result = await requestCreatePost(
        {
          bodyText: '생성되면 안 됨',
          replyParentId: encodeGlobalId('Post', parentId),
          visibility: PostVisibility.PUBLIC,
        },
        auth.token,
      );
      assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    }

    assert.equal(await db.$count(Posts), before);
  });

  test('Content 없는 Repost Parent는 replyParentId VALIDATION으로 거부하고 rollback한다', async () => {
    const auth = await createAuthenticatedSession();
    const author = await createProfile('repost-parent-author');
    const source = await createContentPost(author.id);
    const repost = await db
      .insert(Posts)
      .values({
        profileId: author.id,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);
    const beforePosts = await db.$count(Posts);
    const beforeContents = await db.$count(PostContents);

    const result = await requestCreatePost(
      {
        bodyText: 'invalid reply',
        replyParentId: encodeGlobalId('Post', repost.id),
        visibility: PostVisibility.PUBLIC,
      },
      auth.token,
    );

    assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
    assert.equal(result.errors?.[0]?.extensions?.field, 'replyParentId');
    assert.equal(await db.$count(Posts), beforePosts);
    assert.equal(await db.$count(PostContents), beforeContents);
  });

  test('Post가 아닌 concrete global ID는 mutation input에서 거부한다', async () => {
    const auth = await createAuthenticatedSession();

    const result = await requestCreatePost(
      {
        bodyText: 'invalid global id',
        replyParentId: encodeGlobalId('Profile', auth.profile.id),
        visibility: PostVisibility.PUBLIC,
      },
      auth.token,
    );

    assert.ok(result.errors?.[0]);
    assert.equal(await db.$count(Posts), 0);
  });

  test('비로그인·비활성 Account·사용 불가 Local actor는 PERMISSION_DENIED로 거부한다', async () => {
    const parentAuthor = await createProfile('actor-check-parent');
    const parent = await createContentPost(parentAuthor.id);
    const remoteInstance = await createInstance(InstanceKind.ACTIVITYPUB, InstanceState.ACTIVE);
    const unresponsiveLocalInstance = await createInstance(
      InstanceKind.LOCAL,
      InstanceState.UNRESPONSIVE,
    );
    const actors = await Promise.all([
      createAuthenticatedSession({ activeProfile: false }),
      createAuthenticatedSession({ accountState: AccountState.DISABLED }),
      createAuthenticatedSession({ member: false }),
      createAuthenticatedSession({ profileState: ProfileState.DISABLED }),
      createAuthenticatedSession({ instanceId: remoteInstance.id }),
      createAuthenticatedSession({ instanceId: unresponsiveLocalInstance.id }),
    ]);
    const before = await db.$count(Posts);

    for (const token of [undefined, ...actors.map(({ token }) => token)]) {
      const result = await requestCreatePost(
        {
          bodyText: 'unauthorized reply',
          replyParentId: encodeGlobalId('Post', parent.id),
          visibility: PostVisibility.PUBLIC,
        },
        token,
      );
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }

    assert.equal(await db.$count(Posts), before);
  });
});

type PostNode = {
  __typename: 'Post';
  id: string;
  state: PostState;
  visibility: PostVisibility;
};

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{
    extensions?: { code?: string; field?: string };
    message: string;
  }>;
};

const requestCreatePost = async (
  input: { bodyText: string; replyParentId?: string; visibility: PostVisibility },
  token?: string,
): Promise<GraphQLResult<{ createPost: { post: PostNode } }>> => {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  const response = await app.request('/graphql', {
    body: JSON.stringify({
      query: `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        post { __typename id state visibility }
      }
    }`,
      variables: { input },
    }),
    headers,
    method: 'POST',
  });
  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<{ createPost: { post: PostNode } }>;
};

const assertNoGraphQLErrors = (result: GraphQLResult<unknown>) => {
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
};

const createInstance = (kind: InstanceKind, state: InstanceState) => {
  const suffix = crypto.randomUUID();
  return db
    .insert(Instances)
    .values({ domain: `${kind.toLowerCase()}-${suffix}.example`, kind, state })
    .returning()
    .then(firstOrThrow);
};

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

const createContentPost = async (
  profileId: string,
  {
    bodyText = 'fixture post',
    replyParentId,
    repostSourceId,
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: {
    bodyText?: string;
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

const resetFixtures = async () => {
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Sessions);
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
