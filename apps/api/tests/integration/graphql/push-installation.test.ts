import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AccountState, PushInstallationPlatform, SessionState } from '@kosmo/core/enums';
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

test('인증된 Session에 Push Installation을 등록하고 해제한다', async () => {
  const { account, session } = await createSession();
  const installationId = crypto.randomUUID();

  try {
    const registered = await request<{ registerPushInstallation: { completed: boolean } }>(
      `mutation { registerPushInstallation(input: { installationId: "${installationId}", platform: ${PushInstallationPlatform.ANDROID}, token: "registration-token" }) { completed } }`,
      session.token,
    );
    assert.deepEqual(registered, {
      data: { registerPushInstallation: { completed: true } },
    });

    const row = await db
      .select()
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId));
    assert.equal(row.length, 1);
    assert.equal(row[0]?.accountId, account.id);
    assert.equal(row[0]?.sessionId, session.id);
    assert.equal(row[0]?.platform, PushInstallationPlatform.ANDROID);
    assert.equal(row[0]?.token, 'registration-token');
    const registrationEpoch = row[0]?.registrationEpoch;
    assert.ok(registrationEpoch);

    const unregistered = await request<{ unregisterPushInstallation: { completed: boolean } }>(
      `mutation { unregisterPushInstallation(input: { installationId: "${installationId}" }) { completed } }`,
      session.token,
    );
    assert.deepEqual(unregistered, {
      data: { unregisterPushInstallation: { completed: true } },
    });

    const afterUnregister = await db
      .select({ token: PushInstallations.token })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId));
    assert.deepEqual(afterUnregister, []);

    const reRegistered = await request<{ registerPushInstallation: { completed: boolean } }>(
      `mutation { registerPushInstallation(input: { installationId: "${installationId}", platform: ${PushInstallationPlatform.ANDROID}, token: "registration-token-new" }) { completed } }`,
      session.token,
    );
    assert.deepEqual(reRegistered, {
      data: { registerPushInstallation: { completed: true } },
    });

    const reRegisteredRow = await db
      .select({
        registrationEpoch: PushInstallations.registrationEpoch,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId));
    assert.equal(reRegisteredRow.length, 1);
    assert.equal(reRegisteredRow[0]?.token, 'registration-token-new');
    assert.notEqual(reRegisteredRow[0]?.registrationEpoch.toString(), registrationEpoch.toString());
  } finally {
    await cleanup([account.id]);
  }
});

test('같은 Session의 token 갱신은 등록 epoch를 유지하고 다른 Account 접근은 거부한다', async () => {
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
  const installationId = crypto.randomUUID();

  try {
    const registered = await request<{ registerPushInstallation: { completed: boolean } }>(
      `mutation { registerPushInstallation(input: { installationId: "${installationId}", platform: ${PushInstallationPlatform.ANDROID}, token: "owner-token" }) { completed } }`,
      owner.session.token,
    );
    assert.deepEqual(registered, {
      data: { registerPushInstallation: { completed: true } },
    });

    const initial = await db
      .select({
        accountId: PushInstallations.accountId,
        registrationEpoch: PushInstallations.registrationEpoch,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId));
    assert.equal(initial[0]?.accountId, owner.account.id);
    assert.equal(initial[0]?.token, 'owner-token');
    const initialEpoch = initial[0]?.registrationEpoch.toString();

    const refreshed = await request<{ registerPushInstallation: { completed: boolean } }>(
      `mutation { registerPushInstallation(input: { installationId: "${installationId}", platform: ${PushInstallationPlatform.IOS}, token: "owner-token-refresh" }) { completed } }`,
      owner.session.token,
    );
    assert.deepEqual(refreshed, {
      data: { registerPushInstallation: { completed: true } },
    });

    const afterRefresh = await db
      .select({
        accountId: PushInstallations.accountId,
        sessionId: PushInstallations.sessionId,
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId));
    assert.equal(afterRefresh.length, 1);
    assert.equal(afterRefresh[0]?.accountId, owner.account.id);
    assert.equal(afterRefresh[0]?.platform, PushInstallationPlatform.IOS);
    assert.equal(afterRefresh[0]?.token, 'owner-token-refresh');
    assert.equal(afterRefresh[0]?.registrationEpoch.toString(), initialEpoch);

    const ownerStateBeforeDeniedAccess = afterRefresh;

    const deniedRegister = await request<unknown>(
      `mutation { registerPushInstallation(input: { installationId: "${installationId}", platform: ${PushInstallationPlatform.ANDROID}, token: "other-token" }) { completed } }`,
      other.session.token,
    );
    assert.equal(deniedRegister.data, null);
    assert.equal(deniedRegister.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const deniedUnregister = await request<unknown>(
      `mutation { unregisterPushInstallation(input: { installationId: "${installationId}" }) { completed } }`,
      other.session.token,
    );
    assert.equal(deniedUnregister.data, null);
    assert.equal(deniedUnregister.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const deniedSameAccountUnregister = await request<unknown>(
      `mutation { unregisterPushInstallation(input: { installationId: "${installationId}" }) { completed } }`,
      ownerOtherSession.token,
    );
    assert.equal(deniedSameAccountUnregister.data, null);
    assert.equal(deniedSameAccountUnregister.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

    const ownerStateAfterDeniedAccess = await db
      .select({
        accountId: PushInstallations.accountId,
        sessionId: PushInstallations.sessionId,
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId));
    assert.deepEqual(ownerStateAfterDeniedAccess, ownerStateBeforeDeniedAccess);

    const duplicateInstallationId = crypto.randomUUID();
    const historicalEpoch = Temporal.Instant.from('2000-01-01T00:00:00Z');
    const existingDuplicateRegistration = await request<{
      registerPushInstallation: { completed: boolean };
    }>(
      `mutation { registerPushInstallation(input: { installationId: "${duplicateInstallationId}", platform: ${PushInstallationPlatform.ANDROID}, token: "existing-target-token" }) { completed } }`,
      owner.session.token,
    );
    assert.deepEqual(existingDuplicateRegistration, {
      data: { registerPushInstallation: { completed: true } },
    });
    await db
      .update(PushInstallations)
      .set({ registrationEpoch: historicalEpoch })
      .where(eq(PushInstallations.installationId, duplicateInstallationId));

    const duplicateRegistration = await request<{
      registerPushInstallation: { completed: boolean };
    }>(
      `mutation { registerPushInstallation(input: { installationId: "${duplicateInstallationId}", platform: ${PushInstallationPlatform.ANDROID}, token: "owner-token-refresh" }) { completed } }`,
      owner.session.token,
    );
    assert.deepEqual(duplicateRegistration, {
      data: { registerPushInstallation: { completed: true } },
    });

    const originalAfterDuplicate = await db
      .select({ token: PushInstallations.token })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId));
    assert.deepEqual(originalAfterDuplicate, []);

    const duplicateRow = await db
      .select({
        accountId: PushInstallations.accountId,
        sessionId: PushInstallations.sessionId,
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, duplicateInstallationId));
    assert.equal(duplicateRow.length, 1);
    assert.equal(duplicateRow[0]?.accountId, owner.account.id);
    assert.equal(duplicateRow[0]?.sessionId, owner.session.id);
    assert.equal(duplicateRow[0]?.platform, PushInstallationPlatform.ANDROID);
    assert.equal(duplicateRow[0]?.token, 'owner-token-refresh');
    assert.ok(duplicateRow[0]?.registrationEpoch);
    assert.equal(
      duplicateRow[0]?.registrationEpoch.epochMilliseconds > historicalEpoch.epochMilliseconds,
      true,
    );

    const ownerCurrentState = duplicateRow;
    const deniedTokenTheft = await request<unknown>(
      `mutation { registerPushInstallation(input: { installationId: "${crypto.randomUUID()}", platform: ${PushInstallationPlatform.IOS}, token: "owner-token-refresh" }) { completed } }`,
      other.session.token,
    );
    assert.equal(deniedTokenTheft.data, null);
    assert.equal(deniedTokenTheft.errors?.[0]?.extensions?.code, 'CONFLICT');

    const ownerStateAfterTokenTheft = await db
      .select({
        accountId: PushInstallations.accountId,
        sessionId: PushInstallations.sessionId,
        platform: PushInstallations.platform,
        registrationEpoch: PushInstallations.registrationEpoch,
        token: PushInstallations.token,
      })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, duplicateInstallationId));
    assert.deepEqual(ownerStateAfterTokenTheft, ownerCurrentState);
  } finally {
    await cleanup([owner.account.id, other.account.id]);
  }
});

test('opaque registration token accepts the maximum supported length', async () => {
  const { account, session } = await createSession();
  const installationId = crypto.randomUUID();
  const token = 't'.repeat(4096);

  try {
    const registered = await request<{ registerPushInstallation: { completed: boolean } }>(
      `mutation { registerPushInstallation(input: { installationId: "${installationId}", platform: ${PushInstallationPlatform.ANDROID}, token: "${token}" }) { completed } }`,
      session.token,
    );
    assert.deepEqual(registered, {
      data: { registerPushInstallation: { completed: true } },
    });

    const row = await db
      .select({ token: PushInstallations.token })
      .from(PushInstallations)
      .where(eq(PushInstallations.installationId, installationId));
    assert.equal(row[0]?.token.length, 4096);
    assert.equal(row[0]?.token, token);
  } finally {
    await cleanup([account.id]);
  }
});

test('등록 DB 오류는 GraphQL과 Sentry에 raw token·query·cause를 노출하지 않는다', async () => {
  const { account, session } = await createSession();
  const installationId = crypto.randomUUID();
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
      `mutation { registerPushInstallation(input: { installationId: "${installationId}", platform: ${PushInstallationPlatform.ANDROID}, token: "${token}" }) { completed } }`,
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

test('Push Installation mutation은 인증과 UUID 입력을 요구한다', async () => {
  const unauthenticated = await request<unknown>(
    'mutation { unregisterPushInstallation(input: { installationId: "00000000-0000-4000-8000-000000000000" }) { completed } }',
  );
  assert.equal(unauthenticated.data, null);
  assert.equal(unauthenticated.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');

  const { account, session } = await createSession();
  try {
    const invalid = await request<unknown>(
      'mutation { unregisterPushInstallation(input: { installationId: "not-a-uuid" }) { completed } }',
      session.token,
    );
    assert.equal(invalid.data, null);
    assert.equal(invalid.errors?.[0]?.extensions?.code, 'VALIDATION');

    const invalidToken = await request<unknown>(
      `mutation { registerPushInstallation(input: { installationId: "${crypto.randomUUID()}", platform: ${PushInstallationPlatform.ANDROID}, token: "" }) { completed } }`,
      session.token,
    );
    assert.equal(invalidToken.data, null);
    assert.equal(invalidToken.errors?.[0]?.extensions?.code, 'VALIDATION');
  } finally {
    await cleanup([account.id]);
  }
});
