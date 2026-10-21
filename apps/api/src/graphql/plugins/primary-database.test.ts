import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pgTable, text } from 'drizzle-orm/pg-core';
import {
  GraphQLError,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';
import { createYoga } from 'graphql-yoga';

test('pins the complete named mutation execution to primary during concurrent GraphQL reads', async (t) => {
  const environment = {
    PGHOST: 'primary.example',
    PGREADHOST: 'replica.example',
    PGPORT: '5432',
    PGUSER: 'kosmo_test',
    PGDATABASE: 'kosmo_test',
    PGPASSWORD: 'kosmo_test',
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const { db, pg, pgRead } = await import('@kosmo/core/db');
  assert.ok(pgRead);
  const { useMutationPrimaryDatabase } = await import('./primary-database');
  t.after(async () => {
    await Promise.all([pg.end({ timeout: 0 }), pgRead.end({ timeout: 0 })]);
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  const databaseRoutes: string[] = [];
  const table = pgTable('mutation_primary_read_test', { source: text('source').notNull() });
  const stubQuery = (route: string) =>
    Object.assign(Promise.resolve([{ source: route }]), {
      values: async () => [[route]],
    }) as never;
  t.mock.method(pg, 'unsafe', () => {
    databaseRoutes.push('primary');
    return stubQuery('primary');
  });
  t.mock.method(pgRead, 'unsafe', () => {
    databaseRoutes.push('replica');
    return stubQuery('replica');
  });

  let waitingResolvers = 0;
  let releaseResolvers!: () => void;
  const resolverGate = new Promise<void>((resolve) => {
    releaseResolvers = resolve;
  });
  const readAfterBothResolversStart = async () => {
    waitingResolvers += 1;
    if (waitingResolvers === 2) {
      releaseResolvers();
    }
    await resolverGate;
    const [row] = await db.select().from(table).limit(1);
    return row?.source ?? 'missing';
  };
  const payload = new GraphQLObjectType({
    name: 'Payload',
    fields: {
      value: {
        type: new GraphQLNonNull(GraphQLString),
        resolve: readAfterBothResolversStart,
      },
    },
  });
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        value: {
          type: new GraphQLNonNull(GraphQLString),
          resolve: readAfterBothResolversStart,
        },
      },
    }),
    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: {
        write: {
          type: new GraphQLNonNull(payload),
          resolve: () => ({}),
        },
        fail: {
          type: GraphQLString,
          resolve: async () => {
            await db.select().from(table).limit(1);
            throw new GraphQLError('Expected mutation failure');
          },
        },
      },
    }),
  });
  const yoga = createYoga({ schema, plugins: [useMutationPrimaryDatabase()] });
  const document = 'query Read { value } mutation Write { write { value } } mutation Fail { fail }';
  const execute = async (operationName: string) => {
    const response = await yoga.fetch(
      new Request('http://localhost/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: document, operationName }),
      }),
    );
    return response.json();
  };

  const [queryResult, mutationResult] = await Promise.all([execute('Read'), execute('Write')]);

  assert.deepEqual(queryResult, { data: { value: 'replica' } });
  assert.deepEqual(mutationResult, { data: { write: { value: 'primary' } } });
  assert.deepEqual(databaseRoutes.sort(), ['primary', 'replica']);

  const failureResult = await execute('Fail');
  assert.equal(failureResult.errors?.[0]?.message, 'Expected mutation failure');
  assert.deepEqual(failureResult.errors?.[0]?.path, ['fail']);
  assert.equal(databaseRoutes.at(-1), 'primary');
  assert.deepEqual(await execute('Read'), { data: { value: 'replica' } });
  assert.equal(databaseRoutes.at(-1), 'replica');
});
