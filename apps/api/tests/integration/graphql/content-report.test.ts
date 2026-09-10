import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
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
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const webhookUrl = 'https://hooks.slack.com/services/T000/B000/report';

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'production';
process.env.PUBLIC_ORIGIN = publicOrigin;
process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL = webhookUrl;

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let seedDatabase: typeof CoreSeed.seedDatabase;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let localInstanceId: string;

type GraphQLResult<TData> = {
  data?: TData;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

const mutation = `
  mutation SubmitContentReport($input: SubmitContentReportInput!) {
    submitContentReport(input: $input) {
      status
    }
  }
`;

before(async () => {
  ({ AccountProfiles, Accounts, db, firstOrThrow, pg, PostContents, Posts, Profiles, Sessions } =
    await import('@kosmo/core/db'));
  ({ seedDatabase } = await import('@kosmo/core/db/seed'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  await truncateDatabase();
  localInstanceId = (await seedDatabase({ publicOrigin })).localInstance.id;

  app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  delete process.env.SLACK_CONTENT_REPORT_WEBHOOK_URL;
  await pg.end();
});

test('Profile report sends a minimal confirmed target payload and returns delivered', async (t) => {
  const auth = await createAuthenticatedSession();
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        details: '  신고 사유의 추가 정보  ',
        reason: 'OTHER',
        targetId: encodeGlobalId('Profile', auth.profile.id),
        targetType: 'PROFILE',
      },
    },
    auth.token,
  );

  assert.deepEqual(result, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, webhookUrl);

  const payload = await requests[0]?.json();
  assert.deepEqual(payload, {
    details: '신고 사유의 추가 정보',
    kosmoUrl: `${publicOrigin}/@${auth.handle}`,
    reason: 'OTHER',
    remoteUri: null,
    targetId: auth.profile.id,
    targetType: 'PROFILE',
  });
  assert.equal(JSON.stringify(payload).includes(auth.account.id), false);
  assert.equal(JSON.stringify(payload).includes(auth.account.oidcSubject), false);
});

test('Account without a selected Profile can report a public Post', async (t) => {
  const auth = await createAuthenticatedSession({ selectProfile: false });
  const post = await createPost(auth.profile.id, PostVisibility.PUBLIC);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'HARMFUL_CONTENT',
        targetId: encodeGlobalId('Post', post.id),
        targetType: 'POST',
      },
    },
    auth.token,
  );

  assert.deepEqual(result, { data: { submitContentReport: { status: 'DELIVERED' } } });
  assert.equal(calls, 1);
});

test('Anonymous report requests are rejected before target lookup or Slack', async (t) => {
  const auth = await createAuthenticatedSession();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL(mutation, {
    input: {
      reason: 'SPAM_FRAUD',
      targetId: encodeGlobalId('Profile', auth.profile.id),
      targetType: 'PROFILE',
    },
  });

  assert.equal(result.data, null);
  assert.equal(result.errors?.length, 1);
  assert.equal(calls, 0);
});

test('Post report uses submit-time access and rejects an inaccessible target without Slack', async (t) => {
  const auth = await createAuthenticatedSession();
  const post = await createPost(auth.profile.id, PostVisibility.PUBLIC);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const delivered = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', post.id),
        targetType: 'POST',
      },
    },
    auth.token,
  );
  assert.deepEqual(delivered, { data: { submitContentReport: { status: 'DELIVERED' } } });

  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, post.id));
  const rejected = await requestGraphQL<{
    submitContentReport: { status: string };
  }>(
    mutation,
    {
      input: {
        reason: 'SPAM_FRAUD',
        targetId: encodeGlobalId('Post', post.id),
        targetType: 'POST',
      },
    },
    auth.token,
  );

  assert.deepEqual(rejected, { data: { submitContentReport: { status: 'REJECTED' } } });
  assert.equal(calls, 1);
});

test('Other without details is rejected before target lookup and Slack', async (t) => {
  const auth = await createAuthenticatedSession();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  });

  const result = await requestGraphQL(
    mutation,
    {
      input: {
        details: '   ',
        reason: 'OTHER',
        targetId: encodeGlobalId('Profile', auth.profile.id),
        targetType: 'PROFILE',
      },
    },
    auth.token,
  );

  assert.equal(result.data, null);
  assert.equal(result.errors?.length, 1);
  assert.equal(result.errors?.[0]?.extensions?.code, 'VALIDATION');
  assert.equal(calls, 0);
});

const requestGraphQL = async <TData = Record<string, unknown>>(
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

const createAuthenticatedSession = async ({
  selectProfile = true,
}: { selectProfile?: boolean } = {}) => {
  const handle = `report-${crypto.randomUUID().slice(0, 8)}`;
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Report Account',
      oidcSubject: `report-oidc-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: 'Report Profile',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstanceId,
      normalizedHandle: normalizeHandle(handle),
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(AccountProfiles).values({
    accountId: account.id,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });
  const token = `report-token-${crypto.randomUUID()}`;
  await db.insert(Sessions).values({
    accountId: account.id,
    activeProfileId: selectProfile ? profile.id : null,
    state: SessionState.ACTIVE,
    token,
  });
  return { account, handle, profile, token };
};

const createPost = async (profileId: string, visibility: PostVisibility) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText('reportable post'), postId: post.id })
    .returning()
    .then(firstOrThrow);

  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const truncateDatabase = async () => {
  const database = new URL(databaseUrl);
  assert.ok(new Set(['127.0.0.1', '[::1]', 'localhost']).has(database.hostname));
  assert.match(database.pathname, /^\/kosmo_test(?:_[a-z0-9_]+)?$/);
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
