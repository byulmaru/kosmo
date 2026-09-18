import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  ActivityPubQuoteFormat,
  ActivityPubQuoteStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { encodeGlobalId as globalId } from '@kosmo/core/global-id';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { normalizeHandle } from '@kosmo/core/utils';
import { eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { Env } from '../../../src/context';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubPostQuotes: typeof CoreDb.ActivityPubPostQuotes;
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
      ActivityPubPostQuotes,
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
    await db.delete(ActivityPubPostQuotes);
    await db.update(Posts).set({ currentContentId: null, repostSourceId: null });
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

  test('nodes는 Post fragment와 global ID로 direct Source 계약을 반환한다', async () => {
    const profile = await insertProfile();
    const normal = await insertPost({ bodyText: 'normal', profileId: profile.id });
    const reply = await insertPost({
      bodyText: 'reply',
      profileId: profile.id,
      replyParentId: normal.id,
    });
    const source = await insertPost({ bodyText: 'source', profileId: profile.id });
    const repost = await insertPost({ profileId: profile.id, repostSourceId: reply.id });
    const quoteProfile = await insertProfile();
    const quote = await insertPost({
      bodyText: 'quote',
      profileId: quoteProfile.id,
      repostSourceId: source.id,
    });
    const replyQuoteProfile = await insertProfile();
    const replyQuote = await insertPost({
      bodyText: 'reply quote',
      profileId: replyQuoteProfile.id,
      replyParentId: normal.id,
      repostSourceId: source.id,
    });
    const root = await insertPost({ bodyText: 'root', profileId: profile.id });
    const intermediate = await insertPost({
      bodyText: 'intermediate',
      profileId: profile.id,
      repostSourceId: root.id,
    });
    const nestedQuote = await insertPost({
      bodyText: 'nested quote',
      profileId: profile.id,
      repostSourceId: intermediate.id,
    });

    const result = await requestGraphQL<{
      nodes: Array<{
        __typename: 'Post';
        content: { id: string } | null;
        id: string;
        repostSource: { id: string } | null;
      } | null>;
    }>(
      `query RepostSourceContracts($ids: [ID!]!) {
        nodes(ids: $ids) {
          __typename
          ... on Post {
            id
            content { id }
            repostSource { id }
          }
        }
      }`,
      {
        ids: [normal, reply, repost, quote, replyQuote, nestedQuote].map((post) =>
          globalId('Post', post.id),
        ),
      },
    );

    assert.equal(result.errors, undefined, JSON.stringify(result.errors));
    assert.deepEqual(result.data?.nodes, [
      {
        __typename: 'Post',
        content: { id: globalId('PostContent', normal.currentContentId!) },
        id: globalId('Post', normal.id),
        repostSource: null,
      },
      {
        __typename: 'Post',
        content: { id: globalId('PostContent', reply.currentContentId!) },
        id: globalId('Post', reply.id),
        repostSource: null,
      },
      {
        __typename: 'Post',
        content: null,
        id: globalId('Post', repost.id),
        repostSource: { id: globalId('Post', reply.id) },
      },
      {
        __typename: 'Post',
        content: { id: globalId('PostContent', quote.currentContentId!) },
        id: globalId('Post', quote.id),
        repostSource: { id: globalId('Post', source.id) },
      },
      {
        __typename: 'Post',
        content: { id: globalId('PostContent', replyQuote.currentContentId!) },
        id: globalId('Post', replyQuote.id),
        repostSource: { id: globalId('Post', source.id) },
      },
      {
        __typename: 'Post',
        content: { id: globalId('PostContent', nestedQuote.currentContentId!) },
        id: globalId('Post', nestedQuote.id),
        repostSource: { id: globalId('Post', intermediate.id) },
      },
    ]);
  });

  test('nodes는 unavailable direct Source의 Repost만 숨기고 Quote와 Reply+Quote Content는 유지한다', async () => {
    const profile = await insertProfile();
    const tombstone = await insertPost({
      bodyText: 'deleted source',
      profileId: profile.id,
      state: PostState.DELETED,
    });
    const directTombstoneOuter = await insertPost({
      profileId: profile.id,
      repostSourceId: tombstone.id,
    });
    const indirectProfile = await insertProfile();
    const indirectSource = await insertPost({
      bodyText: 'indirect source',
      profileId: indirectProfile.id,
      repostSourceId: tombstone.id,
    });
    const indirectTombstoneOuter = await insertPost({
      bodyText: 'indirect outer',
      profileId: profile.id,
      repostSourceId: indirectSource.id,
    });
    const directSource = await insertPost({
      bodyText: 'direct source',
      profileId: profile.id,
      visibility: PostVisibility.DIRECT,
    });
    const unauthorizedOuter = await insertPost({
      profileId: profile.id,
      repostSourceId: directSource.id,
    });
    const quoteProfile = await insertProfile();
    const quoteWithTombstoneSource = await insertPost({
      bodyText: 'quote',
      profileId: quoteProfile.id,
      repostSourceId: tombstone.id,
    });
    const replyQuoteWithTombstoneSource = await insertPost({
      bodyText: 'reply quote',
      profileId: quoteProfile.id,
      replyParentId: indirectTombstoneOuter.id,
      repostSourceId: tombstone.id,
    });

    const result = await requestGraphQL<{
      nodes: Array<
        | {
            __typename: 'Post';
            content: { id: string } | null;
            id: string;
            repostSource: { id: string } | null;
          }
        | { __typename: 'PostContent'; bodyText: string; id: string }
        | null
      >;
    }>(
      `query UnavailableRepostSourceContracts($ids: [ID!]!) {
        nodes(ids: $ids) {
          __typename
          ... on Post {
            id
            content { id }
            repostSource { id }
          }
          ... on PostContent {
            id
            bodyText
          }
        }
      }`,
      {
        ids: [
          globalId('Post', directTombstoneOuter.id),
          globalId('Post', indirectTombstoneOuter.id),
          globalId('Post', unauthorizedOuter.id),
          globalId('Post', quoteWithTombstoneSource.id),
          globalId('PostContent', quoteWithTombstoneSource.currentContentId!),
          globalId('Post', replyQuoteWithTombstoneSource.id),
        ],
      },
    );

    assert.equal(result.errors, undefined, JSON.stringify(result.errors));
    assert.deepEqual(result.data?.nodes, [
      null,
      {
        __typename: 'Post',
        content: { id: globalId('PostContent', indirectTombstoneOuter.currentContentId!) },
        id: globalId('Post', indirectTombstoneOuter.id),
        repostSource: { id: globalId('Post', indirectSource.id) },
      },
      null,
      {
        __typename: 'Post',
        content: { id: globalId('PostContent', quoteWithTombstoneSource.currentContentId!) },
        id: globalId('Post', quoteWithTombstoneSource.id),
        repostSource: null,
      },
      {
        __typename: 'PostContent',
        bodyText: 'quote',
        id: globalId('PostContent', quoteWithTombstoneSource.currentContentId!),
      },
      {
        __typename: 'Post',
        content: { id: globalId('PostContent', replyQuoteWithTombstoneSource.currentContentId!) },
        id: globalId('Post', replyQuoteWithTombstoneSource.id),
        repostSource: null,
      },
    ]);
  });

  test('pending/revoked/invalid Quote는 자체 Content를 유지하고 GraphQL Source만 숨긴다', async () => {
    const quoteProfile = await insertProfile();
    const source = await insertPost({ bodyText: 'remote source', profileId: quoteProfile.id });
    const quote = await insertPost({
      bodyText: 'quote body',
      profileId: quoteProfile.id,
      repostSourceId: source.id,
    });
    await db.insert(ActivityPubPostQuotes).values({
      format: ActivityPubQuoteFormat.FEP_044F,
      postId: quote.id,
      resolutionRevision: 1,
      status: ActivityPubQuoteStatus.PENDING,
      targetUri: 'https://remote.example/notes/source',
    });

    const pending = await requestGraphQL<{
      nodes: Array<{
        content: { bodyText: string } | null;
        repostSource: { id: string } | null;
      } | null>;
    }>(
      `query PendingQuote($postId: ID!, $contentId: ID!) {
        nodes(ids: [$postId, $contentId]) {
          ... on Post { content { bodyText } repostSource { id } }
          ... on PostContent { bodyText }
        }
      }`,
      {
        contentId: globalId('PostContent', quote.currentContentId!),
        postId: globalId('Post', quote.id),
      },
    );
    assert.equal(pending.errors, undefined, JSON.stringify(pending.errors));
    assert.deepEqual(pending.data?.nodes, [
      { content: { bodyText: 'quote body' }, repostSource: null },
      { bodyText: 'quote body' },
    ]);

    await db
      .update(ActivityPubPostQuotes)
      .set({ status: ActivityPubQuoteStatus.APPROVED })
      .where(eq(ActivityPubPostQuotes.postId, quote.id));
    const approved = await requestGraphQL<{
      nodes: Array<{ repostSource: { id: string } | null } | null>;
    }>(
      `query ApprovedQuote($postId: ID!) {
        nodes(ids: [$postId]) { ... on Post { repostSource { id } } }
      }`,
      { postId: globalId('Post', quote.id) },
    );
    assert.equal(approved.errors, undefined, JSON.stringify(approved.errors));
    assert.deepEqual(approved.data?.nodes, [{ repostSource: { id: globalId('Post', source.id) } }]);

    for (const status of [ActivityPubQuoteStatus.REVOKED, ActivityPubQuoteStatus.INVALID]) {
      await db
        .update(ActivityPubPostQuotes)
        .set({ status })
        .where(eq(ActivityPubPostQuotes.postId, quote.id));
      const hidden = await requestGraphQL<{
        nodes: Array<{ content: { bodyText: string }; repostSource: null } | null>;
      }>(
        `query HiddenQuote($postId: ID!) { nodes(ids: [$postId]) { ... on Post { content { bodyText } repostSource { id } } } }`,
        { postId: globalId('Post', quote.id) },
      );
      assert.equal(hidden.errors, undefined, JSON.stringify(hidden.errors));
      assert.deepEqual(hidden.data?.nodes, [
        { content: { bodyText: 'quote body' }, repostSource: null },
      ]);
    }
  });

  test('APPROVED Quote도 viewer별 Source visibility를 독립 적용한다', async () => {
    const sourceAuthor = await insertProfile();
    const source = await insertPost({
      bodyText: 'followers source',
      profileId: sourceAuthor.id,
      visibility: PostVisibility.FOLLOWERS,
    });
    const quoteAuthor = await insertProfile();
    const quote = await insertPost({
      bodyText: 'public quote',
      profileId: quoteAuthor.id,
      repostSourceId: source.id,
    });
    await db.insert(ActivityPubPostQuotes).values({
      format: ActivityPubQuoteFormat.FEP_044F,
      postId: quote.id,
      resolutionRevision: 1,
      status: ActivityPubQuoteStatus.APPROVED,
      targetUri: 'https://remote.example/notes/followers-source',
    });
    const allowed = await createAuthenticatedViewer();
    const denied = await createAuthenticatedViewer();
    await db
      .insert(ProfileFollows)
      .values({ followeeProfileId: sourceAuthor.id, followerProfileId: allowed.profile.id });
    const query = `query ViewerQuote($postId: ID!) { nodes(ids: [$postId]) { ... on Post { content { bodyText } repostSource { id } } } }`;

    const visible = await requestGraphQL<{
      nodes: Array<{ content: { bodyText: string }; repostSource: { id: string } | null } | null>;
    }>(query, { postId: globalId('Post', quote.id) }, allowed.token);
    const hidden = await requestGraphQL<{
      nodes: Array<{ content: { bodyText: string }; repostSource: { id: string } | null } | null>;
    }>(query, { postId: globalId('Post', quote.id) }, denied.token);
    assert.deepEqual(visible.data?.nodes, [
      { content: { bodyText: 'public quote' }, repostSource: { id: globalId('Post', source.id) } },
    ]);
    assert.deepEqual(hidden.data?.nodes, [
      { content: { bodyText: 'public quote' }, repostSource: null },
    ]);
  });
});

const createAuthenticatedViewer = async () => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Quote viewer',
      oidcSubject: `quote-viewer-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await insertProfile();
  await db
    .insert(AccountProfiles)
    .values({ accountId: account.id, profileId: profile.id, role: AccountProfileRole.OWNER });
  const token = `quote-token-${crypto.randomUUID()}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: profile.id,
    state: SessionState.ACTIVE,
    token,
  });
  return { profile, token };
};

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
