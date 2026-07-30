import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const webhookUrl = 'https://hooks.slack.com/services/T000/B000/secret';

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'production';
process.env.PUBLIC_ORIGIN = publicOrigin;
process.env.SLACK_FEEDBACK_WEBHOOK_URL = webhookUrl;

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let pg: typeof CoreDb.pg;
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
  mutation SubmitFeedback($input: SubmitFeedbackInput!) {
    submitFeedback(input: $input) {
      completed
    }
  }
`;

before(async () => {
  ({ AccountProfiles, Accounts, db, firstOrThrow, pg, Profiles, Sessions } =
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
  delete process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  await pg.end();
});

test('authenticated selected Profile DB/session identity is allowlisted in trimmed Slack payload', async (t) => {
  const auth = await createAuthenticatedSession();
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  });

  const result = await requestGraphQL<{
    submitFeedback: { completed: boolean };
  }>(
    mutation,
    {
      input: {
        body: '  선택 Profile에서 보낸 의견  ',
        kind: 'FEATURE_REQUEST',
      },
    },
    auth.token,
  );

  assert.deepEqual(result, { data: { submitFeedback: { completed: true } } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, webhookUrl);
  assert.equal(requests[0]?.redirect, 'error');

  const payload = (await requests[0]?.json()) as {
    blocks: Array<{
      fields?: Array<{ text: string }>;
      text?: { text: string };
    }>;
    text: string;
  };
  assert.deepEqual(payload, {
    blocks: [
      { text: { text: '새 피드백', type: 'plain_text' }, type: 'header' },
      {
        fields: [
          { text: '종류: 필요한 점', type: 'plain_text' },
          { text: `Account ID: ${auth.account.id}`, type: 'plain_text' },
          { text: '닉네임: 선택된 프로필', type: 'plain_text' },
          { text: `Profile ID: ${auth.profile.id}`, type: 'plain_text' },
          { text: `Profile: @${auth.handle}`, type: 'plain_text' },
        ],
        type: 'section',
      },
      {
        text: { text: '선택 Profile에서 보낸 의견', type: 'plain_text' },
        type: 'section',
      },
    ],
    text: '새 피드백 · 종류: 필요한 점',
    unfurl_links: false,
    unfurl_media: false,
  });

  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('Account 표시 이름'));
  assert.ok(!serialized.includes('oidc-secret'));
});

test('anonymous와 invalid body는 Slack POST 없이 거부된다', async (t) => {
  const auth = await createAuthenticatedSession();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  });

  const anonymous = await requestGraphQL(mutation, {
    input: { body: '익명 요청', kind: 'POSITIVE' },
  });
  const invalid = await requestGraphQL(
    mutation,
    { input: { body: '   ', kind: 'POSITIVE' } },
    auth.token,
  );

  assert.equal(anonymous.data, null);
  assert.equal(anonymous.errors?.length, 1);
  assert.equal(invalid.data, null);
  assert.equal(invalid.errors?.length, 1);
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

const createAuthenticatedSession = async () => {
  const handle = `selected-${crypto.randomUUID().slice(0, 8)}`;
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Account 표시 이름',
      oidcSubject: `oidc-secret-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: '선택된 프로필',
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
  const token = `token-${crypto.randomUUID()}`;
  await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: profile.id,
      state: SessionState.ACTIVE,
      token,
    })
    .returning()
    .then(firstOrThrow);
  return { account, handle, profile, token };
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
