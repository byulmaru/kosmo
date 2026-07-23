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
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { encodeGlobalId } from '../../../src/graphql/global-id';
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
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let app: Hono<Env>;
let deriveContext: typeof DeriveContext;
let localInstanceId: string;

type ProfileRow = typeof CoreDb.Profiles.$inferSelect;
type PostRow = typeof CoreDb.Posts.$inferSelect;
type LoaderBatchRecord = Map<string, number[]>;
type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{ message: string }>;
};

let loaderBatches: LoaderBatchRecord;

const trackLoaderBatches = <Context extends Awaited<ReturnType<typeof deriveContext>>>(
  context: Context,
) => {
  const originalLoader = context.loader;
  context.loader = ((params: { name: string; load: (keys: unknown[]) => Promise<unknown[]> }) =>
    originalLoader({
      ...params,
      load: async (keys: unknown[]) => {
        const keyCounts = loaderBatches.get(params.name) ?? [];
        keyCounts.push(keys.length);
        loaderBatches.set(params.name, keyCounts);
        return params.load(keys);
      },
    } as never)) as typeof context.loader;
  return context;
};

describe('Post Repost 상태 GraphQL 경계', () => {
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
      c.set('context', trackLoaderBatches(await deriveContext(c)));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => {
    loaderBatches = new Map();
    await resetFixtures();
  });

  after(async () => {
    await pg.end();
  });

  test('모든 viewer에게 eligible direct Repost 수와 현재 Profile의 Repost를 반환한다', async () => {
    const sourceAuthor = await createProfile('source-author');
    const sourceA = await createContentPost(sourceAuthor.id, 'source A');
    const sourceB = await createContentPost(sourceAuthor.id, 'source B');
    const viewerAProfile = await createProfile('viewer-a');
    const viewerBProfile = await createProfile('viewer-b');
    const viewerWithoutRepostProfile = await createProfile('viewer-without-repost');
    const viewerA = await createAuthenticatedSession({ activeProfileId: viewerAProfile.id });
    const viewerB = await createAuthenticatedSession({ activeProfileId: viewerBProfile.id });
    const viewerWithoutRepost = await createAuthenticatedSession({
      activeProfileId: viewerWithoutRepostProfile.id,
    });
    const noSelectedProfile = await createAuthenticatedSession({ activeProfileId: null });

    const repostA = await createRepost(viewerAProfile.id, sourceA.id);
    const repostB = await createRepost(viewerBProfile.id, sourceA.id);
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
    const suspendedInstance = await createSuspendedInstance('suspended-reposter.example');
    await createRepost(
      (await createProfile('suspended-instance-reposter', { instanceId: suspendedInstance.id })).id,
      sourceA.id,
    );
    await createRepost((await createProfile('reply-reposter')).id, sourceA.id, {
      replyParentId: sourceA.id,
    });
    await createRepost((await createProfile('source-b-reposter')).id, sourceB.id);
    await createRepost((await createProfile('quote-reposter')).id, quote.id);

    loaderBatches.clear();
    const batchingResult = await requestRepostState([sourceA.id, sourceB.id], viewerA.token);
    assertNoGraphQLErrors(batchingResult);
    assert.deepEqual(loaderBatches.get('post.repostCount'), [2]);
    assert.deepEqual(loaderBatches.get('post.viewerRepost'), [2]);
    assert.deepEqual(batchingResult.data?.nodes, [
      {
        id: encodeGlobalId('Post', sourceA.id),
        repostCount: 2,
        viewerRepost: { id: encodeGlobalId('Post', repostA.id) },
      },
      { id: encodeGlobalId('Post', sourceB.id), repostCount: 1, viewerRepost: null },
    ]);

    loaderBatches.clear();

    const [
      anonymousResult,
      profileAResult,
      profileBResult,
      profileWithoutRepostResult,
      noSelectedProfileResult,
    ] = await Promise.all([
      requestRepostState([sourceA.id, sourceB.id]),
      requestRepostState([sourceA.id, sourceB.id], viewerA.token),
      requestRepostState([sourceA.id, sourceB.id], viewerB.token),
      requestRepostState([sourceA.id, sourceB.id], viewerWithoutRepost.token),
      requestRepostState([sourceA.id, sourceB.id], noSelectedProfile.token),
    ]);

    assertNoGraphQLErrors(anonymousResult);
    assertNoGraphQLErrors(profileAResult);
    assertNoGraphQLErrors(profileBResult);
    assertNoGraphQLErrors(profileWithoutRepostResult);
    assertNoGraphQLErrors(noSelectedProfileResult);
    assert.deepEqual(anonymousResult.data?.nodes, [
      { id: encodeGlobalId('Post', sourceA.id), repostCount: 2, viewerRepost: null },
      { id: encodeGlobalId('Post', sourceB.id), repostCount: 1, viewerRepost: null },
    ]);
    assert.equal(
      profileAResult.data?.nodes[0]?.viewerRepost?.id,
      encodeGlobalId('Post', repostA.id),
    );
    assert.equal(
      profileBResult.data?.nodes[0]?.viewerRepost?.id,
      encodeGlobalId('Post', repostB.id),
    );
    assert.equal(profileWithoutRepostResult.data?.nodes[0]?.viewerRepost, null);
    assert.equal(noSelectedProfileResult.data?.nodes[0]?.viewerRepost, null);
    assert.equal(anonymousResult.data?.nodes[0]?.viewerRepost, null);
    assert.equal(
      profileAResult.data?.nodes[0]?.repostCount,
      profileBResult.data?.nodes[0]?.repostCount,
    );

    const quoteState = await requestRepostState([quote.id]);
    assertNoGraphQLErrors(quoteState);
    assert.deepEqual(quoteState.data?.nodes, [
      { id: encodeGlobalId('Post', quote.id), repostCount: 1, viewerRepost: null },
    ]);

    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, repostA.id));

    const deletedProfileAResult = await requestRepostState([sourceA.id], viewerA.token);
    assertNoGraphQLErrors(deletedProfileAResult);
    assert.equal(deletedProfileAResult.data?.nodes[0]?.viewerRepost, null);
    assert.equal(deletedProfileAResult.data?.nodes[0]?.repostCount, 1);
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

const createSuspendedInstance = (domain: string) =>
  db
    .insert(Instances)
    .values({ domain, kind: InstanceKind.ACTIVITYPUB, state: InstanceState.SUSPENDED })
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

const requestRepostState = (sourceIds: string[], token?: string) =>
  requestGraphQL<{
    nodes: Array<{ id: string; repostCount: number; viewerRepost: { id: string } | null } | null>;
  }>(
    `query RepostState($sourceIds: [ID!]!) {
      nodes(ids: $sourceIds) {
        ... on Post {
          id
          repostCount
          viewerRepost {
            id
          }
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
