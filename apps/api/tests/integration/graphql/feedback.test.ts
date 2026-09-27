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
import type { feedback as FeedbackRouter } from '../../../src/feedback/route';
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
let feedback: typeof FeedbackRouter;
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
  ({ feedback } = await import('../../../src/feedback/route'));

  await truncateDatabase();
  localInstanceId = (await seedDatabase({ publicOrigin })).localInstance.id;

  app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.route('/graphql', yoga);
  app.route('/feedback', feedback);
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

test('전용 multipart 첨부 3장은 Slack 파일 업로드 뒤 한 번 게시된다', async (t) => {
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

  const result = await requestFeedbackAttachments(
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

  assert.equal(result.status, 200);
  assert.equal(result.completed, true);
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

test('전용 multipart의 fake file와 4장은 Slack 전에 거부된다', async (t) => {
  const auth = await createAuthenticatedSession();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  const fakeForm = new FormData();
  fakeForm.append('body', 'fake');
  fakeForm.append('kind', 'POSITIVE');
  fakeForm.append('attachments', '[object Object]');
  const fakeResponse = await app.request('/feedback/attachments', {
    body: fakeForm,
    headers: { authorization: `Bearer ${auth.token}` },
    method: 'POST',
  });
  const tooMany = await requestFeedbackAttachments(
    {
      body: 'too many',
      kind: 'POSITIVE',
      attachments: [1, 2, 3, 4].map(
        (index) => new File([tinyPng], `${index}.png`, { type: 'image/png' }),
      ),
    },
    auth.token,
  );

  assert.equal(fakeResponse.status, 400);
  assert.equal(tooMany.status, 400);
  assert.equal(calls, 0);
});

test('API multipart transport limit은 parser 전에 적용된다', async () => {
  const auth = await createAuthenticatedSession();
  const response = await app.request('/feedback/attachments', {
    body: new Uint8Array(0),
    headers: {
      authorization: `Bearer ${auth.token}`,
      'content-length': String(feedbackMultipartMaxBytes + 1),
      'content-type': 'multipart/form-data; boundary=test',
    },
    method: 'POST',
  });

  assert.equal(response.status, 413);
});

test('GraphQL multipart는 전용 endpoint로 이동되어 거부된다', async () => {
  const response = await app.request('/graphql', {
    body: new FormData(),
    method: 'POST',
  });

  assert.equal(response.status, 415);
});

test('전용 feedback multipart는 인증과 알 수 없는 필드를 거부한다', async () => {
  const unauthenticated = await app.request('/feedback/attachments', {
    body: new FormData(),
    method: 'POST',
  });
  assert.equal(unauthenticated.status, 401);

  const auth = await createAuthenticatedSession();
  const formData = new FormData();
  formData.append('body', 'body');
  formData.append('kind', 'POSITIVE');
  formData.append('unexpected', 'value');
  formData.append('attachments', new File([tinyPng], 'one.png', { type: 'image/png' }));
  const invalid = await app.request('/feedback/attachments', {
    body: formData,
    headers: { authorization: `Bearer ${auth.token}` },
    method: 'POST',
  });

  assert.equal(invalid.status, 400);

  const createFormData = (body: string, kind: string) => {
    const formData = new FormData();
    formData.append('body', body);
    formData.append('kind', kind);
    formData.append('attachments', new File([tinyPng], 'one.png', { type: 'image/png' }));
    return formData;
  };
  const invalidBody = await app.request('/feedback/attachments', {
    body: createFormData('   ', 'POSITIVE'),
    headers: { authorization: `Bearer ${auth.token}` },
    method: 'POST',
  });
  assert.equal(invalidBody.status, 400);

  const invalidKind = await app.request('/feedback/attachments', {
    body: createFormData('body', 'UNKNOWN'),
    headers: { authorization: `Bearer ${auth.token}` },
    method: 'POST',
  });
  assert.equal(invalidKind.status, 400);

  const duplicateBody = createFormData('body', 'POSITIVE');
  duplicateBody.append('body', 'second body');
  const duplicate = await app.request('/feedback/attachments', {
    body: duplicateBody,
    headers: { authorization: `Bearer ${auth.token}` },
    method: 'POST',
  });
  assert.equal(duplicate.status, 400);
});

test('전용 feedback multipart의 Slack 전달 실패는 안전한 503을 반환한다', async (t) => {
  const auth = await createAuthenticatedSession();
  process.env.SLACK_FEEDBACK_BOT_TOKEN = 'xoxb-test';
  process.env.SLACK_FEEDBACK_CHANNEL_ID = 'C123';
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));

  const result = await requestFeedbackAttachments(
    {
      body: '전달 실패',
      kind: 'POSITIVE',
      attachments: [new File([tinyPng], 'one.png', { type: 'image/png' })],
    },
    auth.token,
  );

  assert.equal(result.status, 503);
  assert.equal(result.message, '피드백을 전달하지 못했어요. 다시 시도해주세요.');
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

const requestFeedbackAttachments = async (
  input: {
    body: string;
    kind: string;
    attachments: File[];
  },
  token?: string,
): Promise<{ status: number; completed?: boolean; message?: string }> => {
  const formData = new FormData();
  formData.append('body', input.body);
  formData.append('kind', input.kind);
  input.attachments.forEach((attachment) => formData.append('attachments', attachment));
  const headers = new Headers();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  const response = await app.request('/feedback/attachments', {
    body: formData,
    headers,
    method: 'POST',
  });
  return { status: response.status, ...(await response.json()) } as {
    status: number;
    completed?: boolean;
    message?: string;
  };
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
