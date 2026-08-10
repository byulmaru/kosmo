import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { postgresSessionTimeouts } from '@kosmo/core/db';
import { parse } from 'graphql';
import { useOperationDatabaseSession } from './operation-db-session';
import type { OperationDatabaseOwner } from '@kosmo/core/db';
import type { UserContext } from '@/context';

type FakeOwner = OperationDatabaseOwner & {
  queries: unknown[];
  events: string[];
  closeOptions: Array<{ force?: boolean } | undefined>;
};

const createOwner = ({
  failInitialization = false,
}: { failInitialization?: boolean } = {}): FakeOwner => {
  const events: string[] = [];
  const queries: unknown[] = [];
  const closeOptions: Array<{ force?: boolean } | undefined> = [];

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
    close: async (options) => {
      closeOptions.push(options);
      events.push('close');
    },
    queries,
    events,
    closeOptions,
  };
};

const createExecution = async ({
  operation = 'query',
  session,
  signal,
  owner,
  executeFn,
}: {
  operation?: 'query' | 'mutation' | 'subscription';
  session?: UserContext['session'];
  signal?: AbortSignal;
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
      signal,
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
      [
        'account',
        'profile',
        String(postgresSessionTimeouts.idle_in_transaction_session_timeout),
        String(postgresSessionTimeouts.lock_timeout),
        String(postgresSessionTimeouts.statement_timeout),
      ],
    );
    assert.deepEqual(owner.events, ['set-actor', 'execute', 'close']);
    assert.deepEqual(owner.closeOptions, [undefined]);
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
      [
        '',
        '',
        String(postgresSessionTimeouts.idle_in_transaction_session_timeout),
        String(postgresSessionTimeouts.lock_timeout),
        String(postgresSessionTimeouts.statement_timeout),
      ],
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
    assert.deepEqual(errorResultOwner.closeOptions, [undefined]);

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
    assert.deepEqual(thrownOwner.closeOptions, [undefined]);
  });

  it('forwards cancellation and awaits one completed close', async () => {
    const owner = createOwner();
    let closeCompleted = false;
    owner.close = async (options) => {
      owner.closeOptions.push(options);
      await Promise.resolve();
      owner.events.push('close');
      closeCompleted = true;
    };
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const { context, replacement } = await createExecution({
      owner,
      signal: controller.signal,
      executeFn: async (args) => {
        receivedSignal = (args as { signal: AbortSignal }).signal;
        await new Promise<never>((_resolve, reject) => {
          if (receivedSignal?.aborted) {
            reject(new Error('execution aborted'));
            return;
          }
          receivedSignal?.addEventListener('abort', () => reject(new Error('execution aborted')), {
            once: true,
          });
        });
      },
    });

    assert.ok(replacement);
    const execution = replacement({ contextValue: context, signal: controller.signal });
    controller.abort();

    await assert.rejects(async () => await execution, { message: 'execution aborted' });
    assert.equal(receivedSignal, controller.signal);
    assert.equal(closeCompleted, true);
    assert.deepEqual(owner.events, ['set-actor', 'close']);
    assert.deepEqual(owner.closeOptions, [{ force: true }]);
  });

  it('closes a pending actor initialization when the request aborts', async () => {
    const owner = createOwner();
    const actorInitialization = Promise.withResolvers<void>();
    const releaseActorInitialization = Promise.withResolvers<void>();
    owner.db = {
      execute: async (query: unknown) => {
        owner.events.push('set-actor');
        owner.queries.push(query);
        actorInitialization.resolve();
        await releaseActorInitialization.promise;
        return [];
      },
    } as unknown as OperationDatabaseOwner['db'];

    const controller = new AbortController();
    const plugin = useOperationDatabaseSession({ createDatabase: () => owner });
    const context = {} as UserContext;
    let executeCalled = false;
    const initialization = plugin.onExecute?.({
      args: {
        document: parse('query { value }'),
        operationName: undefined,
        contextValue: context,
        signal: controller.signal,
      },
      context,
      executeFn: async () => {
        executeCalled = true;
        return { data: { value: 'never' } };
      },
      extendContext: () => undefined,
      setExecuteFn: () => undefined,
    } as never);

    await actorInitialization.promise;
    const abortReason = new Error('initialization aborted');
    controller.abort(abortReason);

    assert.ok(initialization);
    await assert.rejects(
      initialization as Promise<unknown>,
      (error: unknown) => error === abortReason,
    );
    assert.equal(executeCalled, false);
    assert.deepEqual(owner.events, ['set-actor', 'close']);
    assert.deepEqual(owner.closeOptions, [{ force: true }]);

    releaseActorInitialization.resolve();
  });

  it('handles an already aborted request without leaking initialization rejection', async () => {
    const owner = createOwner({ failInitialization: true });
    owner.close = async (options) => {
      owner.closeOptions.push(options);
      owner.events.push('close');
      throw new Error('close failed');
    };
    const controller = new AbortController();
    const abortReason = new Error('already aborted');
    controller.abort(abortReason);
    const plugin = useOperationDatabaseSession({ createDatabase: () => owner });
    const context = {} as UserContext;

    const initialization = plugin.onExecute?.({
      args: {
        document: parse('query { value }'),
        operationName: undefined,
        contextValue: context,
        signal: controller.signal,
      },
      context,
      executeFn: async () => ({ data: { value: 'never' } }),
      extendContext: () => undefined,
      setExecuteFn: () => undefined,
    } as never);

    await assert.rejects(
      initialization as Promise<unknown>,
      (error: unknown) => error === abortReason,
    );
    assert.deepEqual(owner.events, ['set-actor', 'close']);
    assert.deepEqual(owner.closeOptions, [{ force: true }]);
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
    assert.deepEqual(owner.closeOptions, [undefined]);
  });
});
