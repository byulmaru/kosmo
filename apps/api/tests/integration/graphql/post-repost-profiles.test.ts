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
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';

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
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let app: Hono<Env>;
let deriveContext: typeof DeriveContext;
let localInstanceId: string;

type ProfileRow = typeof CoreDb.Profiles.$inferSelect;
type PostRow = typeof CoreDb.Posts.$inferSelect;
type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

describe('Post.repostProfiles GraphQL 경계', () => {
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
      ProfileBlocks,
      Profiles,
      Sessions,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = await import('@kosmo/core/db/seed');

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../../src/context'));
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

  test('작성자만 조회하고 active pure Repost의 visible Profile을 timestamp/id 순으로 페이지한다', async () => {
    const sourceAuthor = await createProfile('repost-source-author');
    const source = await createContentfulPost(sourceAuthor.id, {
      id: '019f8ed0-0000-7000-8000-000000000001',
    });
    const localReposter = await createProfile('repost-local');
    const remoteInstance = await createActivityPubInstance('repost-remote');
    const remoteReposter = await createProfile('repost-remote', { instanceId: remoteInstance.id });
    const quoteReposter = await createProfile('repost-quote');
    const replyReposter = await createProfile('repost-reply');
    const deletedReposter = await createProfile('repost-deleted');
    const disabledReposter = await createProfile('repost-disabled', {
      state: ProfileState.DISABLED,
    });
    const suspendedInstance = await createActivityPubInstance('repost-suspended', {
      state: InstanceState.SUSPENDED,
    });
    const suspendedReposter = await createProfile('repost-suspended', {
      instanceId: suspendedInstance.id,
    });

    const tiedCreatedAt = Temporal.Instant.from('2026-10-29T00:00:00Z');
    await createRepost(localReposter.id, source.id, {
      id: '019f8ed0-0000-7000-8000-000000000011',
      createdAt: tiedCreatedAt,
    });
    await createRepost(remoteReposter.id, source.id, {
      id: '019f8ed0-0000-7000-8000-000000000012',
      createdAt: tiedCreatedAt,
    });
    const quote = await createRepost(quoteReposter.id, source.id, {
      id: '019f8ed0-0000-7000-8000-000000000013',
      createdAt: tiedCreatedAt,
    });
    const quoteContent = await db
      .insert(PostContents)
      .values({ document: postContentDocumentFromText('quote'), postId: quote.id })
      .returning()
      .then(firstOrThrow);
    await db.update(Posts).set({ currentContentId: quoteContent.id }).where(eq(Posts.id, quote.id));
    await createRepost(replyReposter.id, source.id, {
      id: '019f8ed0-0000-7000-8000-000000000014',
      replyParentId: source.id,
    });
    await createRepost(deletedReposter.id, source.id, {
      id: '019f8ed0-0000-7000-8000-000000000015',
      state: PostState.DELETED,
    });
    await createRepost(disabledReposter.id, source.id, {
      id: '019f8ed0-0000-7000-8000-000000000016',
    });
    await createRepost(suspendedReposter.id, source.id, {
      id: '019f8ed0-0000-7000-8000-000000000017',
    });

    const authorSession = await createAuthenticatedSession({ activeProfileId: sourceAuthor.id });
    const firstPage = await requestRepostProfiles(source.id, { first: 1 }, authorSession.token);
    assertNoGraphQLErrors(firstPage);
    assert.deepEqual(
      firstPage.data?.node?.repostProfiles?.edges.map(({ node }) => node.handle),
      [remoteReposter.handle],
    );
    assert.equal(firstPage.data?.node?.repostCount, 2);
    assert.equal(firstPage.data?.node?.repostProfiles?.pageInfo.hasNextPage, true);
    assert.equal(firstPage.data?.node?.repostProfiles?.pageInfo.hasPreviousPage, false);

    const secondPage = await requestRepostProfiles(
      source.id,
      { after: firstPage.data?.node?.repostProfiles?.pageInfo.endCursor, first: 1 },
      authorSession.token,
    );
    assertNoGraphQLErrors(secondPage);
    assert.deepEqual(
      secondPage.data?.node?.repostProfiles?.edges.map(({ node }) => node.handle),
      [localReposter.handle],
    );
    assert.equal(secondPage.data?.node?.repostProfiles?.pageInfo.hasNextPage, false);
    assert.equal(secondPage.data?.node?.repostProfiles?.pageInfo.hasPreviousPage, true);

    const backwardPage = await requestRepostProfiles(
      source.id,
      { before: secondPage.data?.node?.repostProfiles?.pageInfo.startCursor, last: 1 },
      authorSession.token,
    );
    assertNoGraphQLErrors(backwardPage);
    assert.deepEqual(
      backwardPage.data?.node?.repostProfiles?.edges.map(({ node }) => node.handle),
      [remoteReposter.handle],
    );

    const invalidCursor = await requestRepostProfiles(
      source.id,
      { after: 'not-a-cursor', first: 1 },
      authorSession.token,
    );
    assert.equal(invalidCursor.errors?.[0]?.message, 'Invalid Repost Profile cursor');

    const otherProfile = await createProfile('repost-other-profile');
    await db.insert(AccountProfiles).values({
      accountId: authorSession.accountId,
      profileId: otherProfile.id,
      role: AccountProfileRole.OWNER,
    });
    await db
      .update(Sessions)
      .set({ activeProfileId: otherProfile.id })
      .where(eq(Sessions.id, authorSession.sessionId));
    const sameAccountOtherProfile = await requestRepostProfiles(
      source.id,
      { first: 10 },
      authorSession.token,
    );
    assertNoGraphQLErrors(sameAccountOtherProfile);
    assert.equal(sameAccountOtherProfile.data?.node?.repostProfiles, null);
  });

  test('guest·no selected Profile·비작성자에는 null, 작성자에게 Repost가 없으면 빈 connection을 반환한다', async () => {
    const sourceAuthor = await createProfile('repost-null-source');
    const source = await createContentfulPost(sourceAuthor.id);
    const authorSession = await createAuthenticatedSession({ activeProfileId: sourceAuthor.id });
    const otherProfile = await createProfile('repost-null-other');
    const otherSession = await createAuthenticatedSession({ activeProfileId: otherProfile.id });
    const noSelectedSession = await createAuthenticatedSession({ activeProfileId: null });

    const authorResult = await requestRepostProfiles(source.id, { first: 10 }, authorSession.token);
    assertNoGraphQLErrors(authorResult);
    assert.deepEqual(authorResult.data?.node?.repostProfiles?.edges, []);
    assert.equal(authorResult.data?.node?.repostProfiles?.pageInfo.hasNextPage, false);
    assert.equal(authorResult.data?.node?.repostProfiles?.pageInfo.hasPreviousPage, false);

    for (const token of [undefined, otherSession.token, noSelectedSession.token]) {
      const result = await requestRepostProfiles(source.id, { first: 10 }, token);
      assertNoGraphQLErrors(result);
      assert.equal(result.data?.node?.repostProfiles, null);
    }
  });

  test('source가 Tombstone이 되면 Post Node와 repostProfiles를 함께 숨긴다', async () => {
    const sourceAuthor = await createProfile('repost-tombstone-source');
    const source = await createContentfulPost(sourceAuthor.id);
    const session = await createAuthenticatedSession({ activeProfileId: sourceAuthor.id });
    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, source.id));

    const result = await requestRepostProfiles(source.id, { first: 10 }, session.token);
    assertNoGraphQLErrors(result);
    assert.equal(result.data?.node, null);
  });

  test('blocked repost Author는 목록에서 숨기지만 viewer-independent repostCount에는 남긴다', async () => {
    const sourceAuthor = await createProfile('repost-block-source');
    const source = await createContentfulPost(sourceAuthor.id);
    const repostAuthor = await createProfile('repost-block-author');
    await createRepost(repostAuthor.id, source.id);
    const authorSession = await createAuthenticatedSession({ activeProfileId: sourceAuthor.id });

    await db.insert(ProfileBlocks).values({
      ownerProfileId: repostAuthor.id,
      targetProfileId: sourceAuthor.id,
    });

    const result = await requestRepostProfiles(source.id, { first: 10 }, authorSession.token);
    assertNoGraphQLErrors(result);
    assert.deepEqual(result.data?.node?.repostProfiles?.edges, []);
    assert.equal(result.data?.node?.repostCount, 1);
  });

  test('DIRECT·FOLLOWERS Source는 repostProfiles가 visibility를 우회해 노출하지 않는다', async () => {
    const sourceAuthor = await createProfile('repost-private-source');
    const followersSource = await createContentfulPost(sourceAuthor.id, {
      visibility: PostVisibility.FOLLOWERS,
    });
    const directSource = await createContentfulPost(sourceAuthor.id, {
      visibility: PostVisibility.DIRECT,
    });
    const otherSession = await createAuthenticatedSession({
      activeProfileId: (await createProfile('repost-private-viewer')).id,
    });

    for (const source of [followersSource, directSource]) {
      const result = await requestRepostProfiles(source.id, { first: 10 }, otherSession.token);
      assertNoGraphQLErrors(result);
      assert.equal(result.data?.node, null);
    }
  });
});

const createProfile = (
  handle: string,
  {
    instanceId = localInstanceId,
    state = ProfileState.ACTIVE,
  }: { instanceId?: string; state?: ProfileState } = {},
): Promise<ProfileRow> =>
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

const createActivityPubInstance = (
  suffix: string,
  { state = InstanceState.ACTIVE }: { state?: InstanceState } = {},
) =>
  db
    .insert(Instances)
    .values({
      domain: `${suffix}-${crypto.randomUUID()}.example`,
      kind: InstanceKind.ACTIVITYPUB,
      state,
    })
    .returning()
    .then(firstOrThrow);

const createContentfulPost = async (
  profileId: string,
  {
    id,
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: { id?: string; state?: PostState; visibility?: PostVisibility } = {},
): Promise<PostRow> => {
  const post = await db
    .insert(Posts)
    .values({ id, profileId, state, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText(post.id), postId: post.id })
    .returning()
    .then(firstOrThrow);
  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const createRepost = (
  profileId: string,
  repostSourceId: string,
  {
    createdAt,
    currentContentId = null,
    id,
    replyParentId = null,
    state = PostState.ACTIVE,
    visibility = PostVisibility.PUBLIC,
  }: {
    createdAt?: Temporal.Instant;
    currentContentId?: string | null;
    id?: string;
    replyParentId?: string | null;
    state?: PostState;
    visibility?: PostVisibility;
  } = {},
): Promise<PostRow> =>
  db
    .insert(Posts)
    .values({
      createdAt,
      currentContentId,
      id,
      profileId,
      replyParentId,
      repostSourceId,
      state,
      visibility,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async ({
  activeProfileId,
}: {
  activeProfileId: string | null;
}): Promise<{ accountId: string; sessionId: string; token: string }> => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  if (activeProfileId) {
    await db.insert(AccountProfiles).values({
      accountId: account.id,
      profileId: activeProfileId,
      role: AccountProfileRole.OWNER,
    });
  }
  const token = `token-${suffix}`;
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId,
      state: SessionState.ACTIVE,
      token,
    })
    .returning()
    .then(firstOrThrow);
  return { accountId: account.id, sessionId: session.id, token };
};

const requestRepostProfiles = (
  sourceId: string,
  variables: { after?: string | null; before?: string | null; first?: number; last?: number },
  token?: string,
) =>
  requestGraphQL<{
    node: {
      repostCount: number;
      repostProfiles: {
        edges: Array<{ cursor: string; node: { id: string; handle: string } }>;
        pageInfo: {
          endCursor: string | null;
          hasNextPage: boolean;
          hasPreviousPage: boolean;
          startCursor: string | null;
        };
      } | null;
    } | null;
  }>(
    `query RepostProfiles($id: ID!, $after: String, $before: String, $first: Int, $last: Int) {
      node(id: $id) {
        ... on Post {
          repostCount
          repostProfiles(first: $first, after: $after, last: $last, before: $before) {
            edges { cursor node { id handle } }
            pageInfo { endCursor hasNextPage hasPreviousPage startCursor }
          }
        }
      }
    }`,
    { ...variables, id: encodeGlobalId('Post', sourceId) },
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

const resetFixtures = async () => {
  await db.update(Posts).set({ currentContentId: null });
  await db.delete(PostContents);
  await db.delete(Sessions);
  await db.delete(Posts);
  await db.delete(AccountProfiles);
  await db.delete(Accounts);
  await db.delete(Profiles);
};

const truncateDatabase = async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname));
  assert.match(decodeURIComponent(url.pathname.slice(1)), /^kosmo_test(?:_[a-z0-9_]+)?$/);
  await pg.unsafe(`
    DO $$
    DECLARE truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
      INTO truncate_statement FROM pg_tables WHERE schemaname = 'public';
      IF truncate_statement IS NOT NULL THEN EXECUTE truncate_statement; END IF;
    END $$;
  `);
};
