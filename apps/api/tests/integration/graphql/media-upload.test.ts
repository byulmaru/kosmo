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
import { ValidationError } from '@kosmo/core/error';
import {
  headNexusMediaUploadSource,
  parseNexusMediaUploadReference,
} from '@kosmo/core/media-upload';
import { temporalClient } from '@kosmo/core/temporal/client';
import { normalizeHandle } from '@kosmo/core/utils';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { createStagingR2Fixture } from './staging-r2.fixture';
import type { TestContext } from 'node:test';
import type * as CoreDb from '@kosmo/core/db';
import type { encodeGlobalId as EncodeGlobalId } from '@kosmo/core/global-id';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const publicOrigin = 'http://127.0.0.1:4173';
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

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
let stagingR2: Awaited<ReturnType<typeof createStagingR2Fixture>>;

describe('Local Media upload GraphQL 경계', () => {
  before(async () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = publicOrigin;
    stagingR2 = await createStagingR2Fixture();
    process.env.MEDIA_STAGING_R2_ENDPOINT = stagingR2.endpoint;
    process.env.MEDIA_STAGING_R2_BUCKET = 'staging-bucket';
    process.env.MEDIA_STAGING_R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.MEDIA_STAGING_R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.MEDIA_STORAGE_SERVICE_ORIGIN = 'https://media.example';
    process.env.MEDIA_STORAGE_SERVICE_API_KEY = 'secret';

    ({ AccountProfiles, Accounts, db, firstOrThrow, Instances, Media, pg, Profiles, Sessions } =
      await import('@kosmo/core/db'));
    const { seedDatabase } = await import('@kosmo/core/db/seed');

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;

    ({ deriveContext } = await import('../../../src/context'));
    ({ yoga } = await import('../../../src/graphql'));
    ({ encodeGlobalId } = await import('@kosmo/core/global-id'));

    app = new Hono<Env>();
    app.use('*', async (c, next) => {
      c.set('context', await deriveContext(c));
      return next();
    });
    app.route('/graphql', yoga);
  });

  beforeEach(async () => {
    stagingR2.reset();
    await resetFixtures();
  });

  after(async () => {
    await pg.end();
    await stagingR2.close();
  });

  test('Account와 선택 Profile을 Nexus Uploading Media에 결속하고 Account별 조회를 격리한다', async () => {
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
      assert.ok(Date.parse(result.data!.issueMediaUploadUrl.expiresAt) > Date.now());
      assertSignedUpload(result.data!.issueMediaUploadUrl.uploadUrl);
    }

    const stored = await db.select().from(Media);
    assert.equal(stored.length, 3);
    const byStorageReference = new Map(stored.map((media) => [media.storageReference, media]));
    assert.equal(byStorageReference.size, 3);
    for (const media of stored) {
      assertStoredMedia(media);
    }
    assert.equal(
      stored.find((media) => media.profileId === first.profile.id)?.accountId,
      first.account.id,
    );
    assert.equal(
      stored.find((media) => media.profileId === secondProfile.id)?.accountId,
      first.account.id,
    );
    assert.equal(
      stored.find((media) => media.profileId === other.profile.id)?.accountId,
      other.account.id,
    );

    const firstMediaId = firstResult.data!.issueMediaUploadUrl.media.id;
    const storedFirst = stored.find(
      (media) => media.accountId === first.account.id && media.profileId === first.profile.id,
    );
    assert.ok(storedFirst);
    assert.equal(firstMediaId, encodeGlobalId('Media', storedFirst.id));
    assert.deepEqual(await requestMediaNode(firstMediaId, first.token), {
      id: firstMediaId,
      state: 'UPLOADING',
    });
    assert.equal(await requestMediaNode(firstMediaId, other.token), null);
  });

  test('명시한 같은 계정 Profile로 업로드를 발급하고 active session Profile은 유지한다', async () => {
    const auth = await createAuthenticatedSession();
    const composerProfile = await createProfile(`composer-${crypto.randomUUID()}`);
    await db.insert(AccountProfiles).values({
      accountId: auth.account.id,
      profileId: composerProfile.id,
      role: AccountProfileRole.MEMBER,
    });

    const issuedResult = await requestIssueMediaUploadUrl(
      auth.token,
      encodeGlobalId('Profile', composerProfile.id),
    );
    assertNoGraphQLErrors(issuedResult);
    const stored = await db
      .select()
      .from(Media)
      .then((rows) => rows.find((media) => media.profileId === composerProfile.id));
    assert.ok(stored);
    assert.equal(stored.accountId, auth.account.id);
    assert.equal(
      (await db.select().from(Sessions).where(eq(Sessions.token, auth.token)).then(firstOrThrow))
        .activeProfileId,
      auth.profile.id,
    );

    const other = await createAuthenticatedSession();
    const denied = await requestIssueMediaUploadUrl(
      auth.token,
      encodeGlobalId('Profile', other.profile.id),
    );
    assert.equal(denied.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
    assert.equal(await db.$count(Media), 1);
  });

  test('size 생략·null은 기존 Media Storage Service 발급 경로와 active session Profile을 유지한다', async (t) => {
    const auth = await createAuthenticatedSession();
    let requestCount = 0;
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), 'https://media.example/v1/uploads');
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer secret');
      assert.equal(new Headers(init?.headers).get('content-type'), 'application/json');
      assert.equal(init?.body, '{}');
      requestCount += 1;
      return Response.json(
        {
          id: `legacy-reference-${requestCount}`,
          uploadUrl: `https://media.example/upload/${requestCount}`,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
        { status: 201 },
      );
    });

    const results = await Promise.all([
      requestIssueMediaUploadUrl(auth.token, undefined, 'none'),
      requestIssueMediaUploadUrl(auth.token, undefined, 'null'),
      requestIssueMediaUploadUrl(auth.token, undefined, 'empty'),
      requestIssueMediaUploadUrl(auth.token, undefined, 'sizeNull'),
    ]);

    for (const result of results) {
      assertNoGraphQLErrors(result);
      assert.equal(result.data?.issueMediaUploadUrl.media.state, MediaState.UPLOADING);
    }

    const stored = await db.select().from(Media);
    assert.equal(requestCount, 4);
    assert.equal(stored.length, 4);
    assert.deepEqual(
      stored.map((media) => media.profileId),
      [auth.profile.id, auth.profile.id, auth.profile.id, auth.profile.id],
    );
    assert.deepEqual(stored.map((media) => media.storageReference).sort(), [
      'legacy-reference-1',
      'legacy-reference-2',
      'legacy-reference-3',
      'legacy-reference-4',
    ]);
  });

  test('size outside 1..16 MiB is rejected before issuing a URL or creating Media', async (t) => {
    const auth = await createAuthenticatedSession();
    let legacyRequestCount = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      legacyRequestCount += 1;
      return Response.json(
        {
          id: 'legacy-invalid-size',
          uploadUrl: 'https://media.example/upload/invalid-size',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
        { status: 201 },
      );
    });
    for (const size of [0, 16_777_217]) {
      const result = await requestIssueMediaUploadUrl(auth.token, undefined, 'size', size);
      assert.ok(result.errors?.[0]);
      assert.equal(result.data, null);
    }
    assert.equal(legacyRequestCount, 0);
    assert.equal(await db.$count(Media), 0);
  });

  test('서명된 R2 PUT 업로드 후 Nexus workflow가 완료한 Media를 반환한다', async (t) => {
    const auth = await createAuthenticatedSession();
    const issued = await requestIssueMediaUploadUrl(auth.token);
    assertNoGraphQLErrors(issued);
    const { media, uploadUrl } = issued.data!.issueMediaUploadUrl;
    const storedMedia = await db.select().from(Media).then(firstOrThrow);
    const sourceReference = storedMedia.storageReference;
    assert.ok(sourceReference);
    const session = parseNexusMediaUploadReference(sourceReference);
    assert.ok(session);
    assertSignedUpload(uploadUrl, session.sourceKey);

    const upload = await fetch(uploadUrl, {
      body: onePixelPng,
      headers: { 'Content-Type': 'image/png' },
      method: 'PUT',
    });
    assert.equal(upload.status, 200);
    const stagedObject = stagingR2.objects.get(session.sourceKey);
    assert.equal(stagedObject?.contentLength, onePixelPng.length);
    assert.equal(stagedObject?.contentType, 'image/png');

    const execution = mockCompletingWorkflow(t, async ({ mediaId, accountId }) => {
      const row = await db.select().from(Media).where(eq(Media.id, mediaId)).then(firstOrThrow);
      assert.equal(row.accountId, accountId);
      await headNexusMediaUploadSource(row.storageReference!);
      await markMediaReady(mediaId);
      return workflowResult(session.id);
    });

    const completed = await requestCompleteMediaUpload(media.id, auth.token);

    assertNoGraphQLErrors(completed);
    assert.equal(completed.data?.completeMediaUpload.media.id, media.id);
    assert.equal(completed.data?.completeMediaUpload.media.state, MediaState.READY);
    assert.ok(completed.data?.completeMediaUpload.media.readyAt);
    assert.equal(execution.mock.callCount(), 1);
    assertMediaUploadWorkflowOptions(execution.mock.calls[0]!, storedMedia.id, auth.account.id);
    const repeated = await requestCompleteMediaUpload(media.id, auth.token);
    assertNoGraphQLErrors(repeated);
    assert.deepEqual(repeated.data, completed.data);
    assert.equal(execution.mock.callCount(), 1);
    const stored = await db.select().from(Media).then(firstOrThrow);
    assert.equal(stored.url, 'https://media.example/media.webp');
    assert.equal(stored.mediaType, 'image/webp');
  });

  test('workflow 성공 응답만으로 Ready Media를 반환하지 않는다', async (t) => {
    const auth = await createAuthenticatedSession();
    const issued = await requestIssueMediaUploadUrl(auth.token);
    assertNoGraphQLErrors(issued);
    const media = await db.select().from(Media).then(firstOrThrow);
    const execution = mockCompletingWorkflow(t, async () => workflowResult('u_not-finalized'));

    const result = await requestCompleteMediaUpload(
      issued.data!.issueMediaUploadUrl.media.id,
      auth.token,
    );

    assert.ok(result.errors?.[0]);
    assert.equal(result.data, null);
    assert.equal(execution.mock.callCount(), 1);
    assertMediaUploadWorkflowOptions(execution.mock.calls[0]!, media.id, auth.account.id);
    const unchanged = await db.select().from(Media).then(firstOrThrow);
    assert.equal(unchanged.state, MediaState.UPLOADING);
    assert.equal(unchanged.readyAt, null);
    assert.equal(unchanged.url, null);
    assert.equal(unchanged.mediaType, null);
  });

  test('workflow dispatch가 거부되어도 READY로 기록된 결과를 반환한다', async (t) => {
    const auth = await createAuthenticatedSession();
    const issued = await requestIssueMediaUploadUrl(auth.token);
    assertNoGraphQLErrors(issued);
    const media = await db.select().from(Media).then(firstOrThrow);
    const readyAt = Temporal.Now.instant();
    let legacyFetchCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      legacyFetchCalls += 1;
      throw new Error('legacy Media Storage request must not run');
    });
    const execution = t.mock.method(temporalClient.workflow, 'execute', async () => {
      await db
        .update(Media)
        .set({
          mediaType: 'image/webp',
          readyAt,
          state: MediaState.READY,
          url: 'https://media.example/media.webp',
        })
        .where(eq(Media.id, media.id));
      throw new Error('workflow result closed before dispatch response');
    });

    const result = await requestCompleteMediaUpload(
      issued.data!.issueMediaUploadUrl.media.id,
      auth.token,
    );

    assertNoGraphQLErrors(result);
    assert.equal(result.data?.completeMediaUpload.media.state, MediaState.READY);
    assert.equal(
      Temporal.Instant.compare(
        Temporal.Instant.from(result.data!.completeMediaUpload.media.readyAt!),
        readyAt,
      ),
      0,
    );
    assert.equal(execution.mock.callCount(), 1);
    assert.equal(legacyFetchCalls, 0);
    const completed = await db.select().from(Media).then(firstOrThrow);
    assert.equal(Temporal.Instant.compare(completed.readyAt!, readyAt), 0);
  });

  test('Nexus source가 없으면 완료는 실패하고 Uploading Media를 보존한다', async (t) => {
    const auth = await createAuthenticatedSession();
    const issued = await requestIssueMediaUploadUrl(auth.token);
    assertNoGraphQLErrors(issued);
    const media = await db.select().from(Media).then(firstOrThrow);
    const execution = mockCompletingWorkflow(t, async ({ mediaId }) => {
      const row = await db.select().from(Media).where(eq(Media.id, mediaId)).then(firstOrThrow);
      return headNexusMediaUploadSource(row.storageReference!);
    });

    const result = await requestCompleteMediaUpload(
      issued.data!.issueMediaUploadUrl.media.id,
      auth.token,
    );

    assert.ok(result.errors?.[0]);
    assert.equal(result.data, null);
    assert.equal(execution.mock.callCount(), 1);
    assertMediaUploadWorkflowOptions(execution.mock.calls[0]!, media.id, auth.account.id);
    const unchanged = await db.select().from(Media).then(firstOrThrow);
    assert.equal(unchanged.state, MediaState.UPLOADING);
    assert.equal(unchanged.readyAt, null);
    assert.equal(unchanged.url, null);
    assert.equal(unchanged.mediaType, null);
  });

  test('R2 source 검사에서 missing, 만료, 크기, MIME와 metadata 오류를 거부한다', async () => {
    const storageReference = `nexus:v1:${crypto.randomUUID()}`;
    const session = parseNexusMediaUploadReference(storageReference);
    assert.ok(session);

    await assert.rejects(
      headNexusMediaUploadSource(storageReference),
      (error: unknown) =>
        error instanceof ValidationError && error.message === 'Media upload source is missing',
    );
    for (const [object, message] of [
      [
        {
          contentLength: 1,
          contentType: 'image/png',
          lastModified: new Date(Date.now() - 25 * 60 * 60 * 1000),
        },
        'Media upload source has expired',
      ],
      [
        { contentLength: 16_777_217, contentType: 'image/png', lastModified: new Date() },
        'Media upload source exceeds the maximum size',
      ],
      [
        { contentLength: 1, contentType: 'text/plain', lastModified: new Date() },
        'Media upload source has an unsupported content type',
      ],
      [
        { contentLength: 1, contentType: null, lastModified: new Date() },
        'Media upload source metadata is invalid',
      ],
    ] as const) {
      stagingR2.objects.set(session.sourceKey, object);
      await assert.rejects(
        headNexusMediaUploadSource(storageReference),
        (error: unknown) => error instanceof ValidationError && error.message === message,
      );
    }

    stagingR2.objects.set(session.sourceKey, {
      contentLength: 16_777_216,
      contentType: 'image/png',
      lastModified: new Date(),
    });
    assert.deepEqual(await headNexusMediaUploadSource(storageReference), {
      ...session,
      contentType: 'image/png',
    });
  });

  test('유효하지 않은 Account와 선택 Profile은 R2 URL 발급 전에 거부한다', async () => {
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
    assert.equal(await db.$count(Media), 0);
  });

  test('R2 설정이 없으면 Media를 생성하지 않는다', async () => {
    const auth = await createAuthenticatedSession();
    const originalSecret = process.env.MEDIA_STAGING_R2_SECRET_ACCESS_KEY;
    delete process.env.MEDIA_STAGING_R2_SECRET_ACCESS_KEY;
    try {
      const result = await requestIssueMediaUploadUrl(auth.token);
      assert.ok(result.errors?.[0]);
      assert.equal(result.data, null);
    } finally {
      if (originalSecret === undefined) {
        delete process.env.MEDIA_STAGING_R2_SECRET_ACCESS_KEY;
      } else {
        process.env.MEDIA_STAGING_R2_SECRET_ACCESS_KEY = originalSecret;
      }
    }
    assert.equal(await db.$count(Media), 0);
  });

  test('Media persistence 실패는 signed upload URL을 응답하지 않는다', async (t) => {
    const auth = await createAuthenticatedSession();
    await pg.unsafe(`
      CREATE FUNCTION fail_media_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced media insert failure';
      END $$;
      CREATE TRIGGER fail_media_insert
      BEFORE INSERT ON media FOR EACH ROW EXECUTE FUNCTION fail_media_insert();
    `);
    t.after(async () => {
      await pg.unsafe(`
        DROP TRIGGER IF EXISTS fail_media_insert ON media;
        DROP FUNCTION IF EXISTS fail_media_insert();
      `);
    });

    const result = await requestIssueMediaUploadUrl(auth.token);

    assert.ok(result.errors?.[0]);
    assert.equal(result.data, null);
    assert.doesNotMatch(JSON.stringify(result), /test-secret-key/);
    assert.equal(await db.$count(Media), 0);
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
    const storedUploadExpiresAt = (
      await db.select().from(Media).where(eq(Media.id, stored.databaseId)).then(firstOrThrow)
    ).uploadExpiresAt;

    t.mock.method(
      globalThis,
      'fetch',
      async (input: string | URL | Request, init?: RequestInit) => {
        assert.equal(
          String(input),
          'https://media.example/v1/uploads/opaque%2Freference%3Fprovider-owned',
        );
        assert.equal(init?.method, undefined);
        assert.deepEqual(init?.headers, { Authorization: 'Bearer secret' });
        assert.equal(init?.body, undefined);
        assert.ok(init?.signal instanceof AbortSignal);
        return representationResponse();
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
    assert.equal(completed.url, 'https://media.example/media.webp');
    assert.equal(completed.mediaType, 'image/webp');
    assert.ok(completed.uploadExpiresAt);
    assert.equal(completed.uploadExpiresAt.toString(), storedUploadExpiresAt?.toString());
    assert.equal(completed.state, MediaState.READY);
    assert.ok(completed.readyAt);
  });

  test('다른 Account의 완료 요청은 외부 확인 전에 거부한다', async (t) => {
    const execute = t.mock.method(temporalClient.workflow, 'execute');
    const owner = await createAuthenticatedSession();
    const other = await createAuthenticatedSession();
    const media = await createUploadingMedia(
      owner.account.id,
      owner.profile.id,
      `nexus:v1:${crypto.randomUUID()}`,
    );

    const result = await requestCompleteMediaUpload(media.id, other.token);

    assert.equal(result.errors?.[0]?.extensions?.code, 'NOT_FOUND');
    assert.equal(result.data, null);
    assert.equal(execute.mock.callCount(), 0);
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
      async () => Response.json({ mediaType: 'image/webp', url: 'not-a-url' }),
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
      assert.equal(unchanged.url, null);
      assert.equal(unchanged.mediaType, null);
    }
  });

  test('dot-segment opaque reference는 완료 endpoint 밖으로 정규화하지 않는다', async (t) => {
    let fetchCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      fetchCalls += 1;
      return representationResponse();
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
      return representationResponse();
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
      return representationResponse();
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
    t.mock.method(globalThis, 'fetch', async () => representationResponse());
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
    assert.equal(unchanged.url, null);
    assert.equal(unchanged.mediaType, null);
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

const requestIssueMediaUploadUrl = (
  token?: string,
  actorProfileId?: string,
  inputMode: 'size' | 'sizeNull' | 'none' | 'null' | 'empty' = 'size',
  size: number | null = onePixelPng.length,
) => {
  if (inputMode === 'none') {
    return requestGraphQL<IssueMediaUploadUrlData>(
      `mutation IssueMediaUploadUrl {
        issueMediaUploadUrl { media { id state } uploadUrl expiresAt }
      }`,
      {},
      token,
    );
  }

  return requestGraphQL<IssueMediaUploadUrlData>(
    `mutation IssueMediaUploadUrl($input: IssueMediaUploadUrlInput) {
      issueMediaUploadUrl(input: $input) { media { id state } uploadUrl expiresAt }
    }`,
    {
      input:
        inputMode === 'null'
          ? null
          : inputMode === 'empty'
            ? {}
            : {
                ...(actorProfileId ? { actorProfileId } : {}),
                ...(inputMode === 'sizeNull' ? { size: null } : { size }),
              },
    },
    token,
  );
};

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

const representationResponse = () =>
  Response.json({ mediaType: 'image/webp', url: 'https://media.example/media.webp' });

const assertSignedUpload = (uploadUrl: string, sourceKey?: string) => {
  const url = new URL(uploadUrl);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.pathname.startsWith('/staging-bucket/uploads/u_'));
  if (sourceKey) {
    assert.equal(url.pathname, `/staging-bucket/${sourceKey}`);
  }
  assert.equal(url.searchParams.get('X-Amz-Expires'), '600');
  assert.ok(url.searchParams.has('X-Amz-Credential'));
  assert.ok(url.searchParams.has('X-Amz-Signature'));
  assert.ok(url.searchParams.get('X-Amz-SignedHeaders')?.split(';').includes('content-length'));
  assert.equal(
    [...url.searchParams.keys()].some((key) => key.toLowerCase().includes('checksum')),
    false,
  );
  assert.equal(url.href.includes(process.env.MEDIA_STAGING_R2_SECRET_ACCESS_KEY ?? ''), false);
};

const assertStoredMedia = (media: typeof Media.$inferSelect | undefined) => {
  assert.ok(media);
  assert.equal(media.source, MediaSource.LOCAL);
  assert.equal(media.state, MediaState.UPLOADING);
  assert.ok(media.uploadExpiresAt);
  assert.match(media.storageReference ?? '', /^nexus:v1:[0-9a-f-]{36}$/);
  assert.ok(media.uploadExpiresAt.epochMilliseconds > Date.now());
  assert.ok(media.uploadExpiresAt.epochMilliseconds <= Date.now() + 610_000);
};

const mockCompletingWorkflow = (
  t: TestContext,
  complete: (input: { mediaId: string; accountId: string }) => Promise<unknown>,
) => {
  return t.mock.method(
    temporalClient.workflow,
    'execute',
    async (
      _workflow: Parameters<typeof temporalClient.workflow.execute>[0],
      options: Parameters<typeof temporalClient.workflow.execute>[1],
    ) => {
      const input = options.args?.[0] as { mediaId: string; accountId: string };
      return (await complete(input)) as never;
    },
  );
};

const assertMediaUploadWorkflowOptions = (
  call: { arguments: readonly unknown[] },
  mediaId: string,
  accountId: string,
) => {
  const [workflow, rawOptions] = call.arguments;
  assert.equal(workflow, 'mediaUploadWorkflow');
  assert.ok(rawOptions && typeof rawOptions === 'object');
  const options = rawOptions as {
    args?: unknown[];
    workflowId?: string;
    workflowIdConflictPolicy?: WorkflowIdConflictPolicy;
    workflowIdReusePolicy?: WorkflowIdReusePolicy;
  };
  assert.deepEqual(options.args, [{ mediaId, accountId }]);
  assert.equal(options.workflowId, `media-upload:${mediaId}`);
  assert.equal(options.workflowIdConflictPolicy, WorkflowIdConflictPolicy.USE_EXISTING);
  assert.equal(options.workflowIdReusePolicy, WorkflowIdReusePolicy.REJECT_DUPLICATE);
};

const workflowResult = (id: string) => ({
  id,
  mediaType: 'image/webp',
  url: 'https://media.example/media.webp',
});

const markMediaReady = async (mediaId: string) => {
  const readyAt = Temporal.Now.instant();
  return db
    .update(Media)
    .set({
      mediaType: 'image/webp',
      readyAt,
      state: MediaState.READY,
      url: 'https://media.example/media.webp',
    })
    .where(and(eq(Media.id, mediaId), eq(Media.state, MediaState.UPLOADING)))
    .returning()
    .then(firstOrThrow);
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
      uploadExpiresAt: Temporal.Now.instant().add({ minutes: 5 }),
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
