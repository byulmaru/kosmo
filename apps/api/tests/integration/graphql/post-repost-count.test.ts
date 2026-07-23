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
import { encodeGlobalId } from '../../../src/graphql/global-id';
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

type ProfileRow = typeof CoreDb.Profiles.$inferSelect;
type PostRow = typeof CoreDb.Posts.$inferSelect;
type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{ message: string }>;
};

describe('Post repostCount GraphQL 경계', () => {
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

  test('모든 viewer에게 eligible direct Repost만 같은 수로 반환한다', async () => {
    const sourceAuthor = await createProfile('source-author');
    const sourceA = await createContentPost(sourceAuthor.id, 'source A');
    const sourceB = await createContentPost(sourceAuthor.id, 'source B');
    const viewerAProfile = await createProfile('viewer-a');
    const viewerBProfile = await createProfile('viewer-b');
    const viewerA = await createAuthenticatedSession({ activeProfileId: viewerAProfile.id });
    const viewerB = await createAuthenticatedSession({ activeProfileId: viewerBProfile.id });

    await createRepost((await createProfile('reposter-a')).id, sourceA.id);
    await createRepost((await createProfile('reposter-b')).id, sourceA.id);
    const quote = await createRepost((await createProfile('quoter')).id, sourceA.id);
    const quoteContent = await db
      .insert(PostContents)
      .values({ document: postContentDocumentFromText('quote'), postId: quote.id })
      .returning()
      .then(firstOrThrow);
    await db.update(Posts).set({ currentContentId: quoteContent.id }).where(eq(Posts.id, quote.id));
    await createRepost((await createProfile('deleted-reposter')).id, sourceA.id, {
      state: PostState.DELETED,
    });
    await createRepost(
      (await createProfile('inactive-reposter', { state: ProfileState.DISABLED })).id,
      sourceA.id,
    );
    await createRepost((await createProfile('reply-reposter')).id, sourceA.id, {
      replyParentId: sourceA.id,
    });
    await createRepost((await createProfile('source-b-reposter')).id, sourceB.id);
    await createRepost((await createProfile('quote-reposter')).id, quote.id);

    const [anonymous, viewerAResult, viewerBResult] = await Promise.all([
      requestRepostCounts([sourceA.id, sourceB.id]),
      requestRepostCounts([sourceA.id, sourceB.id], viewerA.token),
      requestRepostCounts([sourceA.id, sourceB.id], viewerB.token),
    ]);

    assertNoGraphQLErrors(anonymous);
    assertNoGraphQLErrors(viewerAResult);
    assertNoGraphQLErrors(viewerBResult);
    assert.deepEqual(anonymous.data?.nodes, [
      { id: encodeGlobalId('Post', sourceA.id), repostCount: 2 },
      { id: encodeGlobalId('Post', sourceB.id), repostCount: 1 },
    ]);
    assert.deepEqual(viewerAResult.data?.nodes, anonymous.data?.nodes);
    assert.deepEqual(viewerBResult.data?.nodes, anonymous.data?.nodes);

    const quoteCount = await requestRepostCounts([quote.id]);
    assertNoGraphQLErrors(quoteCount);
    assert.deepEqual(quoteCount.data?.nodes, [
      { id: encodeGlobalId('Post', quote.id), repostCount: 1 },
    ]);
  });
});

const createProfile = (
  handle: string,
  { state = ProfileState.ACTIVE }: { state?: ProfileState } = {},
): Promise<ProfileRow> =>
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

const createContentPost = async (
  profileId: string,
  bodyText: string,
  { state = PostState.ACTIVE }: { state?: PostState } = {},
): Promise<PostRow> => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state, visibility: PostVisibility.PUBLIC })
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

const createRepost = (
  profileId: string,
  repostSourceId: string,
  {
    currentContentId = null,
    replyParentId = null,
    state = PostState.ACTIVE,
  }: {
    currentContentId?: string | null;
    replyParentId?: string | null;
    state?: PostState;
  } = {},
): Promise<PostRow> =>
  db
    .insert(Posts)
    .values({
      currentContentId,
      profileId,
      replyParentId,
      repostSourceId,
      state,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);

const createAuthenticatedSession = async ({
  activeProfileId,
}: {
  activeProfileId: string | null;
}): Promise<{ accountId: string; token: string }> => {
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
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId,
    state: SessionState.ACTIVE,
    token,
  });
  return { accountId: account.id, token };
};

const requestRepostCounts = (sourceIds: string[], token?: string) =>
  requestGraphQL<{ nodes: Array<{ id: string; repostCount: number } | null> }>(
    `query RepostCounts($sourceIds: [ID!]!) {
      nodes(ids: $sourceIds) {
        ... on Post {
          id
          repostCount
        }
      }
    }`,
    { sourceIds: sourceIds.map((id) => encodeGlobalId('Post', id)) },
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
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement FROM pg_tables WHERE schemaname = 'public';
      IF truncate_statement IS NOT NULL THEN EXECUTE truncate_statement; END IF;
    END $$;
  `);
};
