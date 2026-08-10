import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'graphql';
import { useOperationDatabaseSession } from './operation-db-session';
import type { OperationDatabaseOwner } from '@kosmo/core/db';
import type { UserContext } from '@/context';

type FakeOwner = OperationDatabaseOwner & {
  queries: unknown[];
  events: string[];
};

const createOwner = ({
  failInitialization = false,
}: { failInitialization?: boolean } = {}): FakeOwner => {
  const events: string[] = [];
  const queries: unknown[] = [];

  return {
    db: {
      execute: async (query: unknown) => {
        events.push('set-actor');
        queries.push(query);
        if (failInitialization) {
          throw new Error('actor setting failed');
        }
        return [];
      },
    } as unknown as OperationDatabaseOwner['db'],
    close: async () => {
      events.push('close');
    },
    queries,
    events,
  };
};

const createExecution = async ({
  operation = 'query',
  session,
  owner,
  executeFn,
}: {
  operation?: 'query' | 'mutation' | 'subscription';
  session?: UserContext['session'];
  owner: FakeOwner;
  executeFn: (args: unknown) => unknown;
}) => {
  const context = { session } as UserContext;
  let replacement: ((args: unknown) => unknown) | undefined;
  const plugin = useOperationDatabaseSession({ createDatabase: () => owner });

  await plugin.onExecute?.({
    args: {
      document: parse(`${operation} { value }`),
      operationName: undefined,
      contextValue: context,
    },
    context,
    executeFn,
    extendContext: (extension: Partial<UserContext>) => Object.assign(context, extension),
    setExecuteFn: (fn: unknown) => {
      replacement = fn as (args: unknown) => unknown;
    },
  } as never);

  return { context, replacement };
};

describe('GraphQL operation database session', () => {
  it('initializes both actor settings and closes after a regular Query result', async () => {
    const owner = createOwner();
    const { context, replacement } = await createExecution({
      owner,
      session: { id: 'session', accountId: 'account', profileId: 'profile' },
      executeFn: async (args) => {
        owner.events.push('execute');
        assert.equal((args as { contextValue: UserContext }).contextValue.db, context.db);
        return { data: { value: 'ok' } };
      },
    });

    assert.ok(replacement);
    await replacement({ contextValue: context });

    const queryChunks = (owner.queries[0] as { queryChunks: unknown[] }).queryChunks;
    assert.deepEqual(
      queryChunks.filter((chunk): chunk is string => typeof chunk === 'string'),
      ['account', 'profile'],
    );
    assert.deepEqual(owner.events, ['set-actor', 'execute', 'close']);
  });

  it('writes empty actor settings for anonymous operations', async () => {
    const owner = createOwner();
    const { context, replacement } = await createExecution({
      owner,
      executeFn: async () => ({ data: { value: 'ok' } }),
    });

    assert.ok(replacement);
    await replacement({ contextValue: context });

    const queryChunks = (owner.queries[0] as { queryChunks: unknown[] }).queryChunks;
    assert.deepEqual(
      queryChunks.filter((chunk): chunk is string => typeof chunk === 'string'),
      ['', ''],
    );
  });

  it('awaits close when execution returns GraphQL errors or throws', async () => {
    const errorResultOwner = createOwner();
    const errorResult = await createExecution({
      owner: errorResultOwner,
      executeFn: async () => ({ errors: [new Error('resolver failure')] }),
    });

    assert.ok(errorResult.replacement);
    await errorResult.replacement({ contextValue: errorResult.context });
    assert.deepEqual(errorResultOwner.events, ['set-actor', 'close']);

    const thrownOwner = createOwner();
    const thrown = await createExecution({
      owner: thrownOwner,
      executeFn: async () => {
        throw new Error('execution failure');
      },
    });

    assert.ok(thrown.replacement);
    await assert.rejects(async () => await thrown.replacement!({ contextValue: thrown.context }), {
      message: 'execution failure',
    });
    assert.deepEqual(thrownOwner.events, ['set-actor', 'close']);
  });

  it('does not allocate a session for Subscription operations', async () => {
    let created = false;
    const plugin = useOperationDatabaseSession({
      createDatabase: () => {
        created = true;
        return createOwner();
      },
    });
    let replacement = false;
    const context = {} as UserContext;

    await plugin.onExecute?.({
      args: {
        document: parse('subscription { value }'),
        operationName: undefined,
        contextValue: context,
      },
      context,
      executeFn: async () => ({ data: { value: 'stream' } }),
      extendContext: () => undefined,
      setExecuteFn: () => {
        replacement = true;
      },
    } as never);

    assert.equal(created, false);
    assert.equal(replacement, false);
  });

  it('closes when actor initialization fails before execute', async () => {
    const owner = createOwner({ failInitialization: true });
    const plugin = useOperationDatabaseSession({ createDatabase: () => owner });
    const context = {} as UserContext;

    await assert.rejects(
      async () => {
        await plugin.onExecute?.({
          args: {
            document: parse('query { value }'),
            operationName: undefined,
            contextValue: context,
          },
          context,
          executeFn: async () => ({ data: { value: 'never' } }),
          extendContext: () => undefined,
          setExecuteFn: () => undefined,
        } as never);
      },
      { message: 'actor setting failed' },
    );
    assert.deepEqual(owner.events, ['set-actor', 'close']);
  });
});
