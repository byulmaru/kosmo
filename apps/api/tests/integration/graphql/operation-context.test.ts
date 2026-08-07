import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { initContextCache } from '@pothos/core';
import { sql } from 'drizzle-orm';
import { GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLString, parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { Hono } from 'hono';
import type * as CoreDb from '@kosmo/core/db';
import type { ExecutionArgs } from 'graphql';
import type {
  createOperationContext as CreateOperationContext,
  deriveContext as DeriveContext,
  Env,
  ServerContext,
  UserContext,
} from '../../../src/context';
import type {
  executeInOperationTransaction as ExecuteInOperationTransaction,
  setOperationActor as SetOperationActor,
  useOperationContext as UseOperationContext,
} from '../../../src/graphql/plugins/operation-context';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'production';

let db: typeof CoreDb.db;
let pg: typeof CoreDb.pg;
let executeInOperationTransaction: typeof ExecuteInOperationTransaction;
let setOperationActor: typeof SetOperationActor;
let createOperationContext: typeof CreateOperationContext;
let deriveContext: typeof DeriveContext;
let useOperationContext: typeof UseOperationContext;

before(async () => {
  ({ db, pg } = await import('@kosmo/core/db'));
  ({ executeInOperationTransaction } =
    await import('../../../src/graphql/plugins/operation-context'));
  ({ setOperationActor } = await import('../../../src/graphql/plugins/operation-context'));
  ({ createOperationContext, deriveContext } = await import('../../../src/context'));
  ({ useOperationContext } = await import('../../../src/graphql/plugins/operation-context'));
});

after(async () => {
  await pg.end();
});

const readActorState = async (connection: CoreDb.DatabaseConnection) => {
  const [row] = await connection.execute(sql`
    select
      current_setting('transaction_read_only') as read_only,
      current_setting('kosmo.account_id', true) as account_id,
      current_setting('kosmo.profile_id', true) as profile_id
  `);
  return row as {
    read_only: 'on' | 'off';
    account_id: string | null;
    profile_id: string | null;
  };
};

const executeActorState = async (
  accessMode: 'read only' | 'read write',
  actor: { accountId: string; profileId: string },
) => {
  const contextValue = {
    session: {
      id: 'session',
      accountId: actor.accountId,
      profileId: actor.profileId || null,
    },
  } as UserContext;
  const args: ExecutionArgs = {
    schema: {} as never,
    document: parse('query Operation { value }'),
    contextValue,
  };

  const result = await executeInOperationTransaction({
    args,
    accessMode,
    database: db,
    executeFn: async ({ contextValue: transactionContext }) => ({
      data: await readActorState((transactionContext as UserContext).db),
    }),
    setActor: setOperationActor,
  });
  return (result as { data: Awaited<ReturnType<typeof readActorState>> }).data;
};

test('primary transaction access mode and actor settings are local to one operation', async () => {
  const query = await executeActorState('read only', {
    accountId: 'account-query',
    profileId: 'profile-query',
  });
  assert.deepEqual(query, {
    read_only: 'on',
    account_id: 'account-query',
    profile_id: 'profile-query',
  });

  const accountOnly = await executeActorState('read write', {
    accountId: 'account-only',
    profileId: '',
  });
  assert.deepEqual(accountOnly, {
    read_only: 'off',
    account_id: 'account-only',
    profile_id: '',
  });

  const anonymous = await executeActorState('read write', { accountId: '', profileId: '' });
  assert.deepEqual(anonymous, {
    read_only: 'off',
    account_id: '',
    profile_id: '',
  });

  const outside = await db.execute(sql`
    select
      current_setting('kosmo.account_id', true) as account_id,
      current_setting('kosmo.profile_id', true) as profile_id
  `);
  assert.ok(outside[0]?.account_id === null || outside[0]?.account_id === '');
  assert.ok(outside[0]?.profile_id === null || outside[0]?.profile_id === '');
  assert.notEqual(outside[0]?.account_id, 'account-query');
  assert.notEqual(outside[0]?.profile_id, 'profile-query');
});

test('HTTP batch operations receive distinct transaction and DataLoader contexts', async () => {
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'OperationContextBatchQuery',
      fields: {
        transactionId: {
          type: new GraphQLNonNull(GraphQLString),
          resolve: async (_source, _args, rawContext: unknown) => {
            const context = rawContext as UserContext;
            const loader = context.loader({
              name: 'operation-context.batch-transaction-id',
              load: async (keys: string[]) => {
                const [row] = await context.db.execute(sql`
                  select txid_current()::text as transaction_id, pg_sleep(0.05)
                `);
                return keys.map((key) => ({
                  key,
                  transactionId: String(row?.transaction_id),
                }));
              },
              key: (row) => row.key,
            });
            return (await loader.load('same-key')).transactionId;
          },
        },
      },
    }),
  });
  let onExecuteCalls = 0;
  const observerPlugin = {
    onExecute() {
      onExecuteCalls += 1;
    },
  };
  const yoga = createYoga<{ c: ServerContext }, UserContext>({
    schema,
    graphqlEndpoint: '/graphql',
    batching: true,
    plugins: [observerPlugin, useOperationContext()],
    context: ({ c }) => ({
      ...initContextCache(),
      c,
      ...createOperationContext(c.get('context')),
    }),
  });
  const app = new Hono<Env>();
  app.use('*', async (c, next) => {
    c.set('context', await deriveContext(c));
    return next();
  });
  app.all('/graphql', async (c) => {
    const response = await yoga.handle(c.req.raw, { c });
    return c.newResponse(response.body, response);
  });

  const response = await app.request('/graphql', {
    body: JSON.stringify([{ query: '{ transactionId }' }, { query: '{ transactionId }' }]),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(response.status, 200);
  const result = (await response.json()) as Array<{
    data?: { transactionId: string };
    errors?: Array<{ message: string }>;
  }>;
  assert.equal(result.length, 2);
  assert.ok(result.every((item) => !item.errors));
  const transactionIds = result.map((item) => item.data?.transactionId);
  assert.equal(transactionIds.filter(Boolean).length, 2);
  assert.notEqual(transactionIds[0], transactionIds[1]);
  assert.equal(onExecuteCalls, 2);

  const invalidResponse = await app.request('/graphql', {
    body: JSON.stringify({ query: '{ unknownField }' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(invalidResponse.status, 200);
  const invalidResult = (await invalidResponse.json()) as {
    errors?: Array<{ message: string }>;
  };
  assert.ok(invalidResult.errors?.some(({ message }) => message.includes('unknownField')));
  assert.equal(onExecuteCalls, 2);
});
