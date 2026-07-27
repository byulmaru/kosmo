import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import { ne } from 'drizzle-orm';
import { Hono } from 'hono';
import type { TestContext } from 'node:test';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';
import type { encodeGlobalId as EncodeGlobalId } from '../../../src/graphql/global-id';

const publicOrigin = 'http://127.0.0.1:4173';
const browserUploadOrigin = 'http://localhost:5173';
const crossServiceOrigin = process.env.MEDIA_UPLOAD_CROSS_SERVICE_ORIGIN;
const crossServiceApiKey = process.env.MEDIA_UPLOAD_CROSS_SERVICE_API_KEY;
const crossServiceRequested = crossServiceOrigin !== undefined || crossServiceApiKey !== undefined;
// Keep the production smoke-test upload minimal. This is the same non-animated 1×1 PNG fixture
// used by the Media Storage Service integration suite.
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const uploadExpiresAt = '2026-07-27T15:00:00Z';
const serializedUploadExpiresAt = '2026-07-27T15:00:00.000Z';
process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.MEDIA_STORAGE_SERVICE_ORIGIN = 'https://media.example';
process.env.MEDIA_STORAGE_SERVICE_API_KEY = 'secret';

let AccountProfiles: typeof CoreDb.AccountProfiles;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let encodeGlobalId: typeof EncodeGlobalId;
let app: Hono<Env>;
let localInstanceId: string;

describe('Local Media upload GraphQL 경계', () => {
  before(async () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ AccountProfiles, Accounts, db, firstOrThrow, Instances, Media, pg, Profiles, Sessions } =
      await import('@kosmo/core/db'));
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

  test('Account와 선택 Profile을 Uploading Media에 결속하고 Account별 조회를 격리한다', async (t) => {
    const issued = mockUploadIssuance(t);
    const first = await createAuthenticatedSession();
    const remoteInstance = await createInstance(InstanceKind.ACTIVITYPUB, InstanceState.ACTIVE);
    const secondProfile = await createProfile(`second-${crypto.randomUUID()}`, {
      instanceId: remoteInstance.id,
    });
    await db.insert(AccountProfiles).values({
      accountId: first.account.id,
      profileId: secondProfile.id,
      role: AccountProfileRole.MEMBER,
    });
    const secondProfileToken = await createSession(first.account.id, secondProfile.id);
    const other = await createAuthenticatedSession();

    const firstResult = await requestIssueMediaUploadUrl(first.token);
    const secondResult = await requestIssueMediaUploadUrl(secondProfileToken);
    const otherResult = await requestIssueMediaUploadUrl(other.token);

    for (const result of [firstResult, secondResult, otherResult]) {
      assertNoGraphQLErrors(result);
      assert.equal(result.data?.issueMediaUploadUrl.media.state, 'UPLOADING');
      assert.equal(result.data?.issueMediaUploadUrl.expiresAt, serializedUploadExpiresAt);
    }

    const stored = await db.select().from(Media);
    assert.equal(stored.length, 3);
    const byStorageReference = new Map(stored.map((media) => [media.storageReference, media]));
    assertStoredMedia(byStorageReference.get(issued[0]!.id), first.account.id, first.profile.id);
    assertStoredMedia(byStorageReference.get(issued[1]!.id), first.account.id, secondProfile.id);
    assertStoredMedia(byStorageReference.get(issued[2]!.id), other.account.id, other.profile.id);

    const firstMediaId = firstResult.data!.issueMediaUploadUrl.media.id;
    assert.equal(firstMediaId, encodeGlobalId('Media', byStorageReference.get(issued[0]!.id)!.id));
    assert.deepEqual(await requestMediaNode(firstMediaId, first.token), {
      id: firstMediaId,
      state: 'UPLOADING',
    });
    assert.equal(await requestMediaNode(firstMediaId, other.token), null);
  });

  test(
    '실제 Media Storage Service를 거쳐 같은 Local Media를 Ready로 전환한다',
    { skip: !crossServiceRequested },
    async (t) => {
      assert.ok(crossServiceOrigin);
      assert.ok(crossServiceApiKey);
      const previousOrigin = process.env.MEDIA_STORAGE_SERVICE_ORIGIN;
      const previousApiKey = process.env.MEDIA_STORAGE_SERVICE_API_KEY;
      process.env.MEDIA_STORAGE_SERVICE_ORIGIN = crossServiceOrigin;
      process.env.MEDIA_STORAGE_SERVICE_API_KEY = crossServiceApiKey;
      t.after(() => {
        process.env.MEDIA_STORAGE_SERVICE_ORIGIN = previousOrigin;
        process.env.MEDIA_STORAGE_SERVICE_API_KEY = previousApiKey;
      });
      const auth = await createAuthenticatedSession();

      const issued = await requestIssueMediaUploadUrl(auth.token);
      assertNoGraphQLErrors(issued);
      assert.equal(issued.data?.issueMediaUploadUrl.media.state, MediaState.UPLOADING);
      const uploadUrl = issued.data!.issueMediaUploadUrl.uploadUrl;

      const preflight = await fetch(uploadUrl, {
        headers: {
          Origin: browserUploadOrigin,
          'Access-Control-Request-Headers': 'content-type',
          'Access-Control-Request-Method': 'PUT',
        },
        method: 'OPTIONS',
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), browserUploadOrigin);
      assert.equal(preflight.headers.get('access-control-allow-methods'), 'PUT, OPTIONS');
      assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');

      const upload = await fetch(uploadUrl, {
        body: onePixelPng,
        headers: { 'Content-Type': 'image/png', Origin: browserUploadOrigin },
        method: 'PUT',
      });
      const uploadBody = await upload.text();
      assert.equal(upload.status, 201, uploadBody);
      const storedOriginal = JSON.parse(uploadBody) as { id: string; url: string };
      const original = await fetch(storedOriginal.url, { method: 'HEAD' });
      assert.equal(original.status, 200);
      assert.equal(original.headers.get('content-type'), 'image/webp');

      const completed = await requestCompleteMediaUpload(
        issued.data!.issueMediaUploadUrl.media.id,
        auth.token,
      );
      assertNoGraphQLErrors(completed);
      assert.equal(
        completed.data?.completeMediaUpload.media.id,
        issued.data!.issueMediaUploadUrl.media.id,
      );
      assert.equal(completed.data?.completeMediaUpload.media.state, MediaState.READY);
      assert.ok(completed.data?.completeMediaUpload.media.readyAt);
    },
  );

  test('유효하지 않은 Account와 선택 Profile은 외부 발급 전에 거부한다', async (t) => {
    let fetchCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      fetchCalls += 1;
      return uploadResponse();
    });
    const suspendedInstance = await createInstance(InstanceKind.LOCAL, InstanceState.SUSPENDED);
    const actors = await Promise.all([
      createAuthenticatedSession({ activeProfile: false }),
      createAuthenticatedSession({ accountState: AccountState.DISABLED }),
      createAuthenticatedSession({ member: false }),
      createAuthenticatedSession({ profileState: ProfileState.DISABLED }),
      createAuthenticatedSession({ instanceId: suspendedInstance.id }),
    ]);

    for (const token of [undefined, ...actors.map(({ token }) => token)]) {
      const result = await requestIssueMediaUploadUrl(token);
      assert.equal(result.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    }
    assert.equal(fetchCalls, 0);
    assert.equal(await db.$count(Media), 0);
  });

  test('외부 업로드 권한 발급 실패와 잘못된 응답은 Media를 생성하지 않는다', async (t) => {
    const auth = await createAuthenticatedSession();

    for (const response of [
      new Response(null, { status: 503 }),
      Response.json(
        {
          expiresAt: uploadExpiresAt,
          id: '',
          uploadUrl: 'https://media.example/v1/uploads/signed-token',
        },
        { status: 201 },
      ),
      Response.json(
        {
          expiresAt: uploadExpiresAt,
          id: 'provider-opaque-reference',
          uploadUrl: 'data:text/plain,not-an-upload-url',
        },
        { status: 201 },
      ),
    ]) {
      t.mock.method(
        globalThis,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit) => {
          assert.equal(String(input), 'https://media.example/v1/uploads');
          assert.equal(init?.method, 'POST');
          assert.deepEqual(init?.headers, {
            Authorization: 'Bearer secret',
            'Content-Type': 'application/json',
          });
          assert.equal(init?.body, '{}');
          assert.ok(init?.signal instanceof AbortSignal);
          return response;
        },
      );

      const result = await requestIssueMediaUploadUrl(auth.token);

      assert.ok(result.errors?.[0]);
      assert.equal(result.data, null);
      t.mock.restoreAll();
    }
    assert.equal(await db.$count(Media), 0);
  });

  test('Media persistence 실패는 upload URL을 응답하지 않는다', async (t) => {
    const storageReference = 'provider-opaque-reference';
    mockUploadIssuance(t, storageReference);
    const auth = await createAuthenticatedSession();

    const first = await requestIssueMediaUploadUrl(auth.token);
    const failed = await requestIssueMediaUploadUrl(auth.token);

    assertNoGraphQLErrors(first);
    assert.ok(failed.errors?.[0]);
    assert.equal(failed.data, null);
    assert.doesNotMatch(JSON.stringify(failed), /signed-token/);
    assert.equal(await db.$count(Media), 1);
  });

  test('같은 Account의 다른 선택 Profile이 저장 완료된 같은 Media를 Ready로 전환한다', async (t) => {
    const auth = await createAuthenticatedSession();
    const remoteInstance = await createInstance(InstanceKind.ACTIVITYPUB, InstanceState.ACTIVE);
    const selectedProfile = await createProfile(`selected-${crypto.randomUUID()}`, {
      instanceId: remoteInstance.id,
    });
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: selectedProfile.id,
      role: AccountProfileRole.MEMBER,
    });
    const selectedProfileToken = await createSession(auth.account.id, selectedProfile.id);
    const stored = await createUploadingMedia(
      auth.account.id,
      auth.profile.id,
      'opaque/reference?provider-owned',
    );

    t.mock.method(
      globalThis,
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        assert.equal(
          String(input),
          'https://media.example/v1/uploads/opaque%2Freference%3Fprovider-owned',
        );
        assert.equal(init?.method, 'HEAD');
        assert.deepEqual(init?.headers, { Authorization: 'Bearer secret' });
        assert.equal(init?.body, undefined);
        assert.ok(init?.signal instanceof AbortSignal);
        return new Response(null, { status: 204 });
      },
    );

    const result = await requestCompleteMediaUpload(stored.id, selectedProfileToken);

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.completeMediaUpload.media.id, stored.id);
    assert.equal(result.data?.completeMediaUpload.media.state, MediaState.READY);
    assert.ok(result.data?.completeMediaUpload.media.readyAt);

    const completed = await db.select().from(Media).then(firstOrThrow);
    assert.equal(completed.id, stored.databaseId);
    assert.equal(completed.accountId, auth.account.id);
    assert.equal(completed.profileId, auth.profile.id);
    assert.equal(completed.storageReference, stored.storageReference);
    assert.equal(completed.uploadExpiresAt.toString(), uploadExpiresAt);
    assert.equal(completed.state, MediaState.READY);
    assert.ok(completed.readyAt);
  });

  test('다른 Account의 완료 요청은 외부 확인 전에 거부한다', async (t) => {
    let fetchCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      fetchCalls += 1;
      return new Response(null, { status: 204 });
    });
    const owner = await createAuthenticatedSession();
    const other = await createAuthenticatedSession();
    const media = await createUploadingMedia(owner.account.id, owner.profile.id);

    const result = await requestCompleteMediaUpload(media.id, other.token);

    assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(result.data, null);
    assert.equal(fetchCalls, 0);
    const unchanged = await db.select().from(Media).then(firstOrThrow);
    assert.equal(unchanged.state, MediaState.UPLOADING);
    assert.equal(unchanged.readyAt, null);
  });

  test('저장 미완료와 외부 확인 실패는 Uploading state를 유지한다', async (t) => {
    const auth = await createAuthenticatedSession();
    const media = await createUploadingMedia(auth.account.id, auth.profile.id);
    const attempts: Array<() => Promise<Response>> = [
      async () => new Response(null, { status: 404 }),
      async () => new Response(null, { status: 503 }),
      async () => {
        throw new Error('network failure');
      },
    ];

    for (const attempt of attempts) {
      t.mock.method(globalThis, 'fetch', attempt);
      const result = await requestCompleteMediaUpload(media.id, auth.token);
      assert.ok(result.errors?.[0]);
      assert.equal(result.data, null);
      t.mock.restoreAll();

      const unchanged = await db.select().from(Media).then(firstOrThrow);
      assert.equal(unchanged.state, MediaState.UPLOADING);
      assert.equal(unchanged.readyAt, null);
    }
  });

  test('dot-segment opaque reference는 완료 endpoint 밖으로 정규화하지 않는다', async (t) => {
    let fetchCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      fetchCalls += 1;
      return new Response(null, { status: 204 });
    });
    const auth = await createAuthenticatedSession();

    for (const storageReference of ['.', '..']) {
      const { id } = await createUploadingMedia(auth.account.id, auth.profile.id, storageReference);
      const result = await requestCompleteMediaUpload(id, auth.token);
      assert.ok(result.errors?.[0]);
      assert.equal(result.data, null);
    }

    assert.equal(fetchCalls, 0);
    for (const unchanged of await db.select().from(Media)) {
      assert.equal(unchanged.state, MediaState.UPLOADING);
      assert.equal(unchanged.readyAt, null);
    }
  });

  test('반복 완료 요청은 같은 Ready Media와 최초 readyAt을 유지한다', async (t) => {
    let fetchCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      fetchCalls += 1;
      return new Response(null, { status: 204 });
    });
    const auth = await createAuthenticatedSession();
    const media = await createUploadingMedia(auth.account.id, auth.profile.id);

    const first = await requestCompleteMediaUpload(media.id, auth.token);
    const repeated = await requestCompleteMediaUpload(media.id, auth.token);

    assertNoGraphQLErrors(first);
    assertNoGraphQLErrors(repeated);
    assert.deepEqual(repeated.data, first.data);
    assert.equal(fetchCalls, 1);
  });

  test('동시 완료 요청은 하나의 Ready 결과를 공유한다', async (t) => {
    let fetchCalls = 0;
    const bothChecksStarted = Promise.withResolvers<void>();
    t.mock.method(globalThis, 'fetch', async () => {
      fetchCalls += 1;
      if (fetchCalls === 2) {
        bothChecksStarted.resolve();
      }
      await bothChecksStarted.promise;
      return new Response(null, { status: 204 });
    });
    const auth = await createAuthenticatedSession();
    const media = await createUploadingMedia(auth.account.id, auth.profile.id);

    const results = await Promise.all([
      requestCompleteMediaUpload(media.id, auth.token),
      requestCompleteMediaUpload(media.id, auth.token),
    ]);

    for (const result of results) {
      assertNoGraphQLErrors(result);
    }
    assert.deepEqual(results[1]!.data, results[0]!.data);
    assert.equal(fetchCalls, 2);
    const completed = await db.select().from(Media).then(firstOrThrow);
    assert.equal(completed.state, MediaState.READY);
    assert.ok(completed.readyAt);
  });

  test('Ready persistence 실패는 부분 state 전이를 남기지 않는다', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
    const auth = await createAuthenticatedSession();
    const media = await createUploadingMedia(auth.account.id, auth.profile.id);
    await pg.unsafe(`
      CREATE FUNCTION fail_media_ready_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.state = 'READY' THEN RAISE EXCEPTION 'forced ready persistence failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER fail_media_ready_update
      BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION fail_media_ready_update();
    `);
    t.after(async () => {
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS fail_media_ready_update ON media;
        DROP FUNCTION IF EXISTS fail_media_ready_update();
      `);
    });

    const result = await requestCompleteMediaUpload(media.id, auth.token);

    assert.ok(result.errors?.[0]);
    assert.equal(result.data, null);
    const unchanged = await db.select().from(Media).then(firstOrThrow);
    assert.equal(unchanged.state, MediaState.UPLOADING);
    assert.equal(unchanged.readyAt, null);
  });
});

type GraphQLResult<TData> = {
  data?: TData | null;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

type IssueMediaUploadUrlData = {
  issueMediaUploadUrl: {
    expiresAt: string;
    media: { id: string; state: string };
    uploadUrl: string;
  };
};

type CompleteMediaUploadData = {
  completeMediaUpload: {
    media: { id: string; readyAt: string; state: string };
  };
};

const requestIssueMediaUploadUrl = (token?: string) =>
  requestGraphQL<IssueMediaUploadUrlData>(
    `mutation IssueMediaUploadUrl {
      issueMediaUploadUrl { media { id state } uploadUrl expiresAt }
    }`,
    {},
    token,
  );

const requestCompleteMediaUpload = (id: string, token?: string) =>
  requestGraphQL<CompleteMediaUploadData>(
    `mutation CompleteMediaUpload($input: CompleteMediaUploadInput!) {
      completeMediaUpload(input: $input) { media { id readyAt state } }
    }`,
    { input: { id } },
    token,
  );

const requestMediaNode = async (id: string, token: string) => {
  const result = await requestGraphQL<{
    node: { id: string; state: string } | null;
  }>(
    `query MediaNode($id: ID!) {
      node(id: $id) { ... on Media { id state } }
    }`,
    { id },
    token,
  );
  assertNoGraphQLErrors(result);
  return result.data!.node;
};

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

const mockUploadIssuance = (t: TestContext, fixedId?: string) => {
  const issued: Array<{ id: string; uploadUrl: string }> = [];
  t.mock.method(globalThis, 'fetch', async () => {
    const id = fixedId ?? `u_${crypto.randomUUID()}`;
    const uploadUrl = `https://media.example/v1/uploads/signed-token-${issued.length + 1}`;
    issued.push({ id, uploadUrl });
    return uploadResponse(id, uploadUrl);
  });
  return issued;
};

const uploadResponse = (
  id = `u_${crypto.randomUUID()}`,
  uploadUrl = 'https://media.example/v1/uploads/signed-token',
) =>
  Response.json(
    { expiresAt: uploadExpiresAt, id, providerMetadata: { version: 1 }, uploadUrl },
    { status: 201 },
  );

const assertStoredMedia = (
  media: typeof Media.$inferSelect | undefined,
  accountId: string,
  profileId: string,
) => {
  assert.ok(media);
  assert.equal(media.accountId, accountId);
  assert.equal(media.profileId, profileId);
  assert.equal(media.source, MediaSource.LOCAL);
  assert.equal(media.state, MediaState.UPLOADING);
  assert.equal(media.uploadExpiresAt.toString(), uploadExpiresAt);
};

const createUploadingMedia = async (
  accountId: string,
  profileId: string,
  storageReference = `opaque-${crypto.randomUUID()}`,
) => {
  const media = await db
    .insert(Media)
    .values({
      accountId,
      profileId,
      source: MediaSource.LOCAL,
      state: MediaState.UPLOADING,
      storageReference,
      uploadExpiresAt: Temporal.Instant.from(uploadExpiresAt),
    })
    .returning()
    .then(firstOrThrow);
  return {
    databaseId: media.id,
    id: encodeGlobalId('Media', media.id),
    storageReference,
  };
};

const createInstance = (kind: InstanceKind, state: InstanceState) =>
  db
    .insert(Instances)
    .values({ domain: `${crypto.randomUUID()}.example`, kind, state })
    .returning()
    .then(firstOrThrow);

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
  const token = await createSession(account.id, activeProfile ? profile.id : null);
  return { account, profile, token };
};

const createSession = async (accountId: string, profileId: string | null) => {
  const token = `token-${crypto.randomUUID()}`;
  await db.insert(Sessions).values({
    accountId,
    activeProfileId: profileId,
    state: SessionState.ACTIVE,
    token,
  });
  return token;
};

const resetFixtures = async () => {
  await db.delete(Media);
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
