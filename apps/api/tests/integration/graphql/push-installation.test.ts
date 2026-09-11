import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AccountState, PushInstallationPlatform, SessionState } from '@kosmo/core/enums';
import { decodeGlobalId, encodeGlobalId } from '@kosmo/core/global-id';
import * as Sentry from '@sentry/node';
import { eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;

let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let pg: typeof CoreDb.pg;
let PushInstallations: typeof CoreDb.PushInstallations;
let Sessions: typeof CoreDb.Sessions;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;
let restoreSentryTransport: (() => void) | undefined;
const sentryEvents: unknown[] = [];

type GraphQLResult<T> = {
  data?: T;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

type RegisterResult = {
  registerPushInstallation: { id: string };
};

const registerMutation = (platform: PushInstallationPlatform, token: string) =>
  `mutation { registerPushInstallation(input: { platform: ${platform}, token: "${token}" }) { id } }`;

const updateMutation = (id: string, platform: PushInstallationPlatform, token: string) =>
  `mutation { updatePushInstallation(input: { id: "${id}", platform: ${platform}, token: "${token}" }) { completed } }`;

const unregisterMutation = (id: string) =>
  `mutation { unregisterPushInstallation(input: { id: "${id}" }) { completed } }`;

const decodeInstallationId = (result: GraphQLResult<RegisterResult>) => {
  assert.ok(result.data?.registerPushInstallation.id, JSON.stringify(result));
  const decoded = decodeGlobalId(result.data.registerPushInstallation.id);
  assert.equal(decoded.typename, 'PushInstallation');
  return decoded.id;
};

const waitForPushInstallationDeleteTableLock = async (blockingPid: number): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [activity] = await db.execute<{ blocked: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE ${blockingPid} = ANY(pg_blocking_pids(pid))
      ) AS blocked
    `);
    if (activity?.blocked) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail('Push installation register DELETE did not reach the table lock barrier');
};

before(async () => {
  process.env.NODE_ENV = 'production';
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.invalid/1';
  process.env.ENVIRONMENT = 'test';
  process.env.SENTRY_RELEASE = 'push-installation-test';
  ({ Accounts, db, firstOrThrow, pg, PushInstallations, Sessions } =
    await import('@kosmo/core/db'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  const sentryTransport = Sentry.getClient()?.getTransport();
  assert.ok(sentryTransport);
  const originalSentrySend = sentryTransport.send;
  sentryTransport.send = async (event) => {
    sentryEvents.push(event);
    return { statusCode: 200 };
  };
  restoreSentryTransport = () => {
    sentryTransport.send = originalSentrySend;
  };

  app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  restoreSentryTransport?.();
  await Sentry.close(0);
  await pg.end();
});

const createSession = async () => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({ displayName: suffix, oidcSubject: suffix, state: AccountState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  const session = await db
    .insert(Sessions)
    .values({ accountId: account.id, state: SessionState.ACTIVE, token: `token-${suffix}` })
    .returning()
    .then(firstOrThrow);
  return { account, session };
};

const cleanup = async (accountIds: string[]) => {
  await db.delete(Sessions).where(inArray(Sessions.accountId, accountIds));
  await db.delete(Accounts).where(inArray(Accounts.id, accountIds));
};

const request = async <T>(query: string, token?: string): Promise<GraphQLResult<T>> => {
  const response = await app.request('/graphql', {
    body: JSON.stringify({ query }),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    method: 'POST',
  });
  return response.json() as Promise<GraphQLResult<T>>;
};

test('서버가 발급한 Global ID로 등록·갱신·해제하고 삭제된 ID는 재생성하지 않는다', async () => {
  const { account, session } = await createSession();

  try {
    const registered = await request<RegisterResult>(
      registerMutation(PushInstallationPlatform.ANDROID, 'registration-token'),
      session.token,
    );
    const installationId = decodeInstallationId(registered);
    const row = await db
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.id, installationId));

    assert.equal(row.length, 1);
    assert.equal(row[0]?.id, installationId);
    assert.equal(row[0]?.accountId, account.id);
    assert.equal(row[0]?.sessionId, session.id);
    assert.equal(row[0]?.platform, PushInstallationPlatform.ANDROID);
    assert.equal(row[0]?.token, 'registration-token');
    const registrationEpoch = row[0]?.registrationEpoch;
    assert.ok(registrationEpoch);

    const unregistered = await request<{ unregisterPushInstallation: { completed: boolean } }>(
      unregisterMutation(registered.data!.registerPushInstallation.id),
      session.token,
    );
    assert.deepEqual(unregistered, {
      data: { unregisterPushInstallation: { completed: true } },
    });
    assert.deepEqual(
      await db
        .select({ id: PushInstallations.id })
        .from(PushInstallations)
        .where(eq(PushInstallations.id, installationId)),
      [],
    );

    const deletedUpdate = await request<unknown>(
      updateMutation(
        registered.data!.registerPushInstallation.id,
        PushInstallationPlatform.IOS,
        'deleted-id-token',
      ),
      session.token,
    );
    assert.equal(deletedUpdate.data, null);
    assert.equal(deletedUpdate.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const reRegistered = await request<RegisterResult>(
      registerMutation(PushInstallationPlatform.IOS, 'registration-token-new'),
      session.token,
    );
    const reRegisteredId = decodeInstallationId(reRegistered);
    assert.notEqual(reRegisteredId, installationId);
    const reRegisteredRow = await db
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.id, reRegisteredId));
    assert.equal(reRegisteredRow.length, 1);
    assert.equal(reRegisteredRow[0]?.token, 'registration-token-new');
    assert.equal(reRegisteredRow[0]?.platform, PushInstallationPlatform.IOS);
    assert.notEqual(reRegisteredRow[0]?.registrationEpoch.toString(), registrationEpoch.toString());

    const staleUnregister = await request<{ unregisterPushInstallation: { completed: boolean } }>(
      unregisterMutation(registered.data!.registerPushInstallation.id),
      session.token,
    );
    assert.deepEqual(staleUnregister, {
      data: { unregisterPushInstallation: { completed: true } },
    });
    assert.deepEqual(
      await db
        .select({ id: PushInstallations.id })
        .from(PushInstallations)
        .where(eq(PushInstallations.id, reRegisteredId)),
      [{ id: reRegisteredId }],
    );

    const updated = await request<{ updatePushInstallation: { completed: boolean } }>(
      updateMutation(
        reRegistered.data!.registerPushInstallation.id,
        PushInstallationPlatform.ANDROID,
        'registration-token-refreshed',
      ),
      session.token,
    );
    assert.deepEqual(updated, {
      data: { updatePushInstallation: { completed: true } },
    });
    const afterUpdate = await db
      .select({
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.id, reRegisteredId));
    assert.deepEqual(afterUpdate, [
      {
        platform: PushInstallationPlatform.ANDROID,
        registrationEpoch: reRegisteredRow[0]!.registrationEpoch,
        token: 'registration-token-refreshed',
      },
    ]);
  } finally {
    await cleanup([account.id]);
  }
});

test('Account·Session 소유권과 같은 Account token 이동을 검증한다', async () => {
  const owner = await createSession();
  const other = await createSession();
  const ownerOtherSession = await db
    .insert(Sessions)
    .values({
      accountId: owner.account.id,
      state: SessionState.ACTIVE,
      token: `token-${crypto.randomUUID()}`,
    })
    .returning()
    .then(firstOrThrow);

  try {
    const registered = await request<RegisterResult>(
      registerMutation(PushInstallationPlatform.ANDROID, 'owner-token'),
      owner.session.token,
    );
    const installationId = decodeInstallationId(registered);
    const historicalEpoch = Temporal.Instant.from('2000-01-01T00:00:00Z');
    await db
      .update(PushInstallations)
      .set({ registrationEpoch: historicalEpoch })
      .where(eq(PushInstallations.id, installationId));
    const initial = await db
      .select({ registrationEpoch: PushInstallations.registrationEpoch })
      .from(PushInstallations)
      .where(eq(PushInstallations.id, installationId));
    assert.deepEqual(initial, [{ registrationEpoch: historicalEpoch }]);

    const refreshed = await request<{ updatePushInstallation: { completed: boolean } }>(
      updateMutation(
        registered.data!.registerPushInstallation.id,
        PushInstallationPlatform.IOS,
        'owner-token-refresh',
      ),
      owner.session.token,
    );
    assert.deepEqual(refreshed, {
      data: { updatePushInstallation: { completed: true } },
    });
    const refreshedRow = await db
      .select({
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.id, installationId));
    assert.equal(refreshedRow[0]?.platform, PushInstallationPlatform.IOS);
    assert.equal(refreshedRow[0]?.token, 'owner-token-refresh');
    assert.equal(refreshedRow[0]?.registrationEpoch.toString(), historicalEpoch.toString());

    const stateBeforeDeniedUpdates = await db
      .select({
        accountId: PushInstallations.accountId,
        id: PushInstallations.id,
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        sessionId: PushInstallations.sessionId,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.id, installationId));

    const deniedAccountUpdate = await request<unknown>(
      updateMutation(
        registered.data!.registerPushInstallation.id,
        PushInstallationPlatform.ANDROID,
        'other-token',
      ),
      other.session.token,
    );
    assert.equal(deniedAccountUpdate.data, null);
    assert.equal(deniedAccountUpdate.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const deniedSessionUpdate = await request<unknown>(
      updateMutation(
        registered.data!.registerPushInstallation.id,
        PushInstallationPlatform.ANDROID,
        'other-session-token',
      ),
      ownerOtherSession.token,
    );
    assert.equal(deniedSessionUpdate.data, null);
    assert.equal(deniedSessionUpdate.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const stateAfterDeniedUpdates = await db
      .select({
        accountId: PushInstallations.accountId,
        id: PushInstallations.id,
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        sessionId: PushInstallations.sessionId,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.id, installationId));
    assert.deepEqual(stateAfterDeniedUpdates, stateBeforeDeniedUpdates);

    const moved = await request<RegisterResult>(
      registerMutation(PushInstallationPlatform.ANDROID, 'owner-token-refresh'),
      ownerOtherSession.token,
    );
    const movedId = decodeInstallationId(moved);
    assert.notEqual(movedId, installationId);
    assert.deepEqual(
      await db
        .select({ id: PushInstallations.id })
        .from(PushInstallations)
        .where(eq(PushInstallations.id, installationId)),
      [],
    );
    const movedRow = await db
      .select({
        accountId: PushInstallations.accountId,
        id: PushInstallations.id,
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        sessionId: PushInstallations.sessionId,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.id, movedId));
    assert.equal(movedRow.length, 1);
    assert.equal(movedRow[0]?.accountId, owner.account.id);
    assert.equal(movedRow[0]?.id, movedId);
    assert.equal(movedRow[0]?.platform, PushInstallationPlatform.ANDROID);
    assert.equal(movedRow[0]?.sessionId, ownerOtherSession.id);
    assert.equal(movedRow[0]?.token, 'owner-token-refresh');
    assert.ok(movedRow[0]?.registrationEpoch.epochMilliseconds > historicalEpoch.epochMilliseconds);

    const movedStateBeforeDeniedAccess = movedRow;

    const deniedTokenTheft = await request<unknown>(
      registerMutation(PushInstallationPlatform.IOS, 'owner-token-refresh'),
      other.session.token,
    );
    assert.equal(deniedTokenTheft.data, null);
    assert.equal(deniedTokenTheft.errors?.[0]?.extensions?.code, 'CONFLICT');

    const deniedAccountUnregister = await request<unknown>(
      unregisterMutation(moved.data!.registerPushInstallation.id),
      other.session.token,
    );
    assert.equal(deniedAccountUnregister.data, null);
    assert.equal(deniedAccountUnregister.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const deniedSessionUnregister = await request<unknown>(
      unregisterMutation(moved.data!.registerPushInstallation.id),
      owner.session.token,
    );
    assert.equal(deniedSessionUnregister.data, null);
    assert.equal(deniedSessionUnregister.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const movedStateAfterDeniedAccess = await db
      .select({
        accountId: PushInstallations.accountId,
        id: PushInstallations.id,
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        sessionId: PushInstallations.sessionId,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.id, movedId));
    assert.deepEqual(movedStateAfterDeniedAccess, movedStateBeforeDeniedAccess);
  } finally {
    await cleanup([owner.account.id, other.account.id]);
  }
});

test('동시 token 갱신으로 바뀐 기존 row는 register 중복 정리에서 보존한다', async () => {
  const { account, session } = await createSession();
  const lockSession = await pg.reserve();
  let lockHeld = false;
  let registering: Promise<GraphQLResult<RegisterResult>> | undefined;

  try {
    const registered = await request<RegisterResult>(
      registerMutation(PushInstallationPlatform.ANDROID, 'race-token-a'),
      session.token,
    );
    const installationId = decodeInstallationId(registered);

    await lockSession`BEGIN`;
    await lockSession`LOCK TABLE "push_installation" IN SHARE MODE`;
    lockHeld = true;
    const [connection] = await lockSession<{ pid: number }[]>`
      SELECT pg_backend_pid()::int AS pid
    `;
    assert.ok(connection);

    registering = request(
      registerMutation(PushInstallationPlatform.IOS, 'race-token-a'),
      session.token,
    );
    await waitForPushInstallationDeleteTableLock(connection.pid);

    const [updated] = await lockSession<{ id: string; token: string }[]>`
      UPDATE "push_installation"
      SET "token" = ${'race-token-b'}
      WHERE "id" = ${installationId}
      RETURNING "id", "token"
    `;
    assert.deepEqual(updated, { id: installationId, token: 'race-token-b' });
    await lockSession`COMMIT`;
    lockHeld = false;

    const reRegistered = await registering;
    const reRegisteredId = decodeInstallationId(reRegistered);
    assert.notEqual(reRegisteredId, installationId);

    const rows = await db
      .select({ id: PushInstallations.id, token: PushInstallations.token })
      .from(PushInstallations)
      .where(inArray(PushInstallations.id, [installationId, reRegisteredId]));
    assert.deepEqual(
      rows.sort((left, right) => left.id.localeCompare(right.id)),
      [
        { id: installationId, token: 'race-token-b' },
        { id: reRegisteredId, token: 'race-token-a' },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
  } finally {
    if (lockHeld) {
      await lockSession`ROLLBACK`;
    }
    if (registering) {
      await Promise.allSettled([registering]);
    }
    lockSession.release();
    await cleanup([account.id]);
  }
});

test('opaque registration token accepts 4096 bytes and rejects longer input', async () => {
  const { account, session } = await createSession();
  const token = 't'.repeat(4096);

  try {
    const registered = await request<RegisterResult>(
      registerMutation(PushInstallationPlatform.ANDROID, token),
      session.token,
    );
    const installationId = decodeInstallationId(registered);
    const row = await db
      .select({ token: PushInstallations.token })
      .from(PushInstallations)
      .where(eq(PushInstallations.id, installationId));
    assert.equal(row[0]?.token.length, 4096);
    assert.equal(row[0]?.token, token);

    const tooLong = await request<unknown>(
      registerMutation(PushInstallationPlatform.ANDROID, `${token}x`),
      session.token,
    );
    assert.equal(tooLong.data, null);
    assert.equal(tooLong.errors?.[0]?.extensions?.code, 'VALIDATION');
  } finally {
    await cleanup([account.id]);
  }
});

test('등록 DB 오류는 GraphQL과 Sentry에 raw token·query·cause를 노출하지 않는다', async () => {
  const { account, session } = await createSession();
  const token = `fake-fcm-token-${crypto.randomUUID()}`;

  try {
    await db.execute(
      sql.raw(`
        CREATE OR REPLACE FUNCTION fail_push_installation_insert() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'injected push token failure: %', NEW.token;
        END;
        $$;
        DROP TRIGGER IF EXISTS fail_push_installation_insert_trigger ON push_installation;
        CREATE TRIGGER fail_push_installation_insert_trigger
          BEFORE INSERT ON push_installation
          FOR EACH ROW EXECUTE FUNCTION fail_push_installation_insert();
      `),
    );

    sentryEvents.length = 0;
    const result = await request<unknown>(
      registerMutation(PushInstallationPlatform.ANDROID, token),
      session.token,
    );
    await Sentry.flush(1000);

    assert.equal(result.data, null);
    assert.equal(result.errors?.[0]?.message, 'Unexpected error');
    assert.equal(result.errors?.[0]?.extensions?.code, 'INTERNAL_SERVER_ERROR');

    const captured = JSON.stringify(sentryEvents);
    assert.match(captured, /"exception"/);
    assert.equal(captured.includes(token), false);
    assert.equal(captured.includes('params:'), false);
    assert.equal(captured.includes('Failed query:'), false);
    assert.equal(captured.includes('injected push token failure'), false);
  } finally {
    await db.execute(
      sql.raw(`
        DROP TRIGGER IF EXISTS fail_push_installation_insert_trigger ON push_installation;
        DROP FUNCTION IF EXISTS fail_push_installation_insert();
      `),
    );
    await cleanup([account.id]);
  }
});

test('Push Installation mutation은 인증과 server-issued Global ID를 요구한다', async () => {
  const unauthenticated = await request<unknown>(
    registerMutation(PushInstallationPlatform.ANDROID, 'unauthenticated-token'),
  );
  assert.equal(unauthenticated.data, null);
  assert.equal(unauthenticated.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

  const { account, session } = await createSession();
  try {
    const wrongType = encodeGlobalId('Profile', crypto.randomUUID());
    const invalidType = await request<unknown>(unregisterMutation(wrongType), session.token);
    assert.equal(invalidType.data, null);
    assert.equal(invalidType.errors?.[0]?.extensions?.code, 'VALIDATION');

    const invalidUpdateType = await request<unknown>(
      updateMutation(wrongType, PushInstallationPlatform.ANDROID, 'invalid-type-token'),
      session.token,
    );
    assert.equal(invalidUpdateType.data, null);
    assert.equal(invalidUpdateType.errors?.[0]?.extensions?.code, 'VALIDATION');

    const invalidGlobalId = await request<unknown>(
      'mutation { unregisterPushInstallation(input: { id: "not-a-global-id" }) { completed } }',
      session.token,
    );
    assert.equal(invalidGlobalId.data, null);
    assert.ok(invalidGlobalId.errors?.length);

    const invalidToken = await request<unknown>(
      registerMutation(PushInstallationPlatform.ANDROID, ''),
      session.token,
    );
    assert.equal(invalidToken.data, null);
    assert.equal(invalidToken.errors?.[0]?.extensions?.code, 'VALIDATION');
  } finally {
    await cleanup([account.id]);
  }
});
