import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { ACCOUNT_DELETION_WORKFLOW_TYPE } from '@kosmo/core/temporal/workflows';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type * as TemporalClient from '@kosmo/core/temporal/client';
import type { deriveContext as DeriveContext, Env } from '../../../src/context';
import type { yoga as YogaRouter } from '../../../src/graphql';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let pg: typeof CoreDb.pg;
let Sessions: typeof CoreDb.Sessions;
let temporalClient: typeof TemporalClient.temporalClient;
let deriveContext: typeof DeriveContext;
let yoga: typeof YogaRouter;
let app: Hono<Env>;

type GraphQLResult<T> = {
  data?: T | null;
  errors?: Array<{ extensions?: { code?: string }; message: string }>;
};

before(async () => {
  process.env.NODE_ENV = 'production';
  ({ Accounts, db, firstOrThrow, pg, Sessions } = await import('@kosmo/core/db'));
  ({ temporalClient } = await import('@kosmo/core/temporal/client'));
  ({ deriveContext } = await import('../../../src/context'));
  ({ yoga } = await import('../../../src/graphql'));

  app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.route('/graphql', yoga);
});

after(async () => {
  await pg.end();
});

const createFixture = async () => {
  const suffix = crypto.randomUUID();
  const account = await db
    .insert(Accounts)
    .values({
      displayName: suffix,
      oidcSubject: `subject-${suffix}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      state: SessionState.ACTIVE,
      token: `token-${suffix}`,
    })
    .returning()
    .then(firstOrThrow);

  return { account, session };
};

const cleanup = async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
  await db.delete(Sessions).where(eq(Sessions.accountId, fixture.account.id));
  await db.delete(Accounts).where(eq(Accounts.id, fixture.account.id));
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

test('탈퇴 mutation은 인증된 Account ID로 Workflow를 실행하고 완료 결과를 기다린다', async (t) => {
  const fixture = await createFixture();
  let release!: (completed: boolean) => void;
  const workflowResult = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  let signalExecute!: () => void;
  const executeCalled = new Promise<void>((resolve) => {
    signalExecute = resolve;
  });
  const execute = t.mock.method(temporalClient.workflow, 'execute', async () => {
    signalExecute();
    return workflowResult as never;
  });
  let settled = false;

  try {
    const deletion = request<{
      deleteAccount: { completed: boolean };
    }>('mutation { deleteAccount { completed } }', fixture.session.token).then((result) => {
      settled = true;
      return result;
    });

    await executeCalled;
    assert.equal(settled, false);
    assert.equal(execute.mock.calls.length, 1);
    assert.equal(execute.mock.calls[0]?.arguments[0], ACCOUNT_DELETION_WORKFLOW_TYPE);
    const options = execute.mock.calls[0]?.arguments[1];
    assert.ok(options);
    assert.deepEqual(options.args, [{ accountId: fixture.account.id }]);
    assert.equal(options.workflowId, `${ACCOUNT_DELETION_WORKFLOW_TYPE}:${fixture.account.id}`);
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');

    release(true);
    assert.deepEqual(await deletion, {
      data: { deleteAccount: { completed: true } },
    });
  } finally {
    release(false);
    await cleanup(fixture);
  }
});

test('탈퇴 mutation은 Workflow의 BLOCKED 결과를 그대로 반환한다', async (t) => {
  const fixture = await createFixture();
  const execute = t.mock.method(temporalClient.workflow, 'execute', async () => false as never);

  try {
    assert.deepEqual(
      await request<{ deleteAccount: { completed: boolean } }>(
        'mutation { deleteAccount { completed } }',
        fixture.session.token,
      ),
      { data: { deleteAccount: { completed: false } } },
    );
    assert.equal(execute.mock.calls.length, 1);
  } finally {
    await cleanup(fixture);
  }
});

test('탈퇴 mutation은 인증되지 않은 요청을 거부하고 Workflow를 실행하지 않는다', async (t) => {
  const execute = t.mock.method(temporalClient.workflow, 'execute', async () => true as never);

  const anonymous = await request('mutation { deleteAccount { completed } }');

  assert.equal(anonymous.data, null);
  assert.equal(anonymous.errors?.[0]?.extensions?.code, 'PERMISSION_DENIED');
  assert.equal(execute.mock.calls.length, 0);
});
