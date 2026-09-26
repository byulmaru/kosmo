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
import { feedbackMultipartMaxBytes } from '@kosmo/core/validation';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const webhookUrl = 'https://hooks.slack.com/services/T000/B000/secret';
const tinyPng = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
);

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
  delete process.env.SLACK_FEEDBACK_BOT_TOKEN;
  delete process.env.SLACK_FEEDBACK_CHANNEL_ID;
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

test('multipart 첨부 3장은 Slack 파일 업로드 뒤 한 번 게시된다', async (t) => {
  const auth = await createAuthenticatedSession();
  process.env.SLACK_FEEDBACK_BOT_TOKEN = 'xoxb-test';
  process.env.SLACK_FEEDBACK_CHANNEL_ID = 'C123';
  const requests: Request[] = [];
  let uploadIndex = 0;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.endsWith('/files.getUploadURLExternal')) {
      const fileId = `F${++uploadIndex}`;
      return new Response(
        JSON.stringify({
          file_id: fileId,
          ok: true,
          upload_url: `https://files.slack.com/upload/v1/${fileId}`,
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    }
    if (request.url.startsWith('https://files.slack.com/upload/v1/')) {
      return new Response(null, { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  });

  const result = await requestMultipart(
    {
      body: '원본 이미지 첨부',
      kind: 'BUG_REPORT',
      attachments: [
        new File([tinyPng], 'one.png', { type: 'image/png' }),
        new File([tinyPng], 'two.png', { type: 'image/png' }),
        new File([tinyPng], 'three.png', { type: 'image/png' }),
      ],
    },
    auth.token,
  );

  assert.deepEqual(result, { data: { submitFeedback: { completed: true } } });
  assert.equal(requests.length, 7);
  assert.equal(requests[0]?.url, 'https://slack.com/api/files.getUploadURLExternal');
  assert.equal(requests[2]?.url, 'https://slack.com/api/files.getUploadURLExternal');
  assert.equal(requests[4]?.url, 'https://slack.com/api/files.getUploadURLExternal');
  assert.equal(requests[6]?.url, 'https://slack.com/api/files.completeUploadExternal');
  assert.deepEqual(JSON.parse(String((await requests[6]!.formData()).get('files'))), [
    { id: 'F1' },
    { id: 'F2' },
    { id: 'F3' },
  ]);
});

test('multipart fake file와 4장은 Slack 전에 거부된다', async (t) => {
  const auth = await createAuthenticatedSession();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  const fake = await requestGraphQL(
    mutation,
    { input: { body: 'fake', kind: 'POSITIVE', attachments: [{}] } },
    auth.token,
    400,
  );
  const tooMany = await requestMultipart(
    {
      body: 'too many',
      kind: 'POSITIVE',
      attachments: [1, 2, 3, 4].map(
        (index) => new File([tinyPng], `${index}.png`, { type: 'image/png' }),
      ),
    },
    auth.token,
  );

  assert.equal(fake.data == null, true);
  assert.equal(fake.errors?.length, 1);
  assert.equal(tooMany.data, null);
  assert.equal(tooMany.errors?.length, 1);
  assert.equal(calls, 0);
});

test('API multipart transport limit은 GraphQL parser 전에 적용된다', async () => {
  const response = await app.request('/graphql', {
    body: new Uint8Array(0),
    headers: {
      'content-length': String(feedbackMultipartMaxBytes + 1),
      'content-type': 'multipart/form-data; boundary=test',
    },
    method: 'POST',
  });

  assert.equal(response.status, 413);
});

const requestGraphQL = async <TData = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
  expectedStatus = 200,
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
  assert.equal(response.status, expectedStatus);
  return (await response.json()) as GraphQLResult<TData>;
};

const requestMultipart = async (
  input: {
    body: string;
    kind: string;
    attachments: File[];
  },
  token?: string,
): Promise<GraphQLResult<{ submitFeedback: { completed: boolean } }>> => {
  const formData = new FormData();
  formData.append(
    'operations',
    JSON.stringify({
      query: mutation,
      variables: {
        input: {
          attachments: input.attachments.map(() => null),
          body: input.body,
          kind: input.kind,
        },
      },
    }),
  );
  formData.append(
    'map',
    JSON.stringify(
      Object.fromEntries(
        input.attachments.map((_attachment, index) => [
          String(index),
          [`variables.input.attachments.${index}`],
        ]),
      ),
    ),
  );
  input.attachments.forEach((attachment, index) => formData.append(String(index), attachment));
  const headers = new Headers();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  const response = await app.request('/graphql', { body: formData, headers, method: 'POST' });
  assert.equal(response.status, 200);
  return (await response.json()) as GraphQLResult<{
    submitFeedback: { completed: boolean };
  }>;
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
