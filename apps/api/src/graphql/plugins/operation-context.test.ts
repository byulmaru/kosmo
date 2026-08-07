import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GraphQLError, parse } from 'graphql';
import { createOperationContext, deriveContext } from '@/context';
import {
  executeInOperationTransaction,
  isCancellationError,
  useOperationContext,
} from './operation-context';
import type { Transaction } from '@kosmo/core/db';
import type { ExecutionArgs, ExecutionResult } from 'graphql';
import type { ServerContext, UserContext } from '@/context';
import type { OperationAccessMode, OperationDatabase } from './operation-context';

type TransactionState = {
  accessModes: OperationAccessMode[];
  commits: number;
  rollbacks: number;
  transaction: Transaction;
};

const createTransactionDatabase = (options: { commitError?: Error } = {}) => {
  const state: TransactionState = {
    accessModes: [],
    commits: 0,
    rollbacks: 0,
    transaction: undefined as never,
  };

  const transaction = {
    execute: async () => [],
  } as unknown as Transaction;
  state.transaction = transaction;

  const database = {
    transaction: async (
      callback: (transaction: Transaction) => Promise<unknown> | unknown,
      config?: { accessMode?: OperationAccessMode },
    ) => {
      state.accessModes.push(config?.accessMode ?? 'read write');
      try {
        const result = await callback(transaction);
        if (options.commitError) {
          throw options.commitError;
        }
        state.commits += 1;
        return result;
      } catch (error) {
        state.rollbacks += 1;
        throw error;
      }
    },
  } as unknown as OperationDatabase;

  return { database, state };
};

const createContext = (signal?: AbortSignal): UserContext =>
  ({
    session: { id: 'session', accountId: 'account', profileId: 'profile' },
    c: signal
      ? ({ req: { raw: new Request('http://localhost/graphql', { signal }) } } as ServerContext)
      : ({} as ServerContext),
  }) as UserContext;

const createArgs = (contextValue: UserContext): ExecutionArgs => ({
  schema: {} as never,
  document: parse('query Operation { value }'),
  contextValue,
});

const withTimeout = <T>(promise: Promise<T>, message = 'operation timed out'): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), 100);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
};

describe('GraphQL operation transaction lifecycle', () => {
  it('uses read-only and read-write access modes and commits ordinary results', async () => {
    const query = createTransactionDatabase();
    const queryResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async ({ contextValue }) => {
        assert.equal((contextValue as UserContext).db, query.state.transaction);
        return { data: { value: 'query' } };
      },
      accessMode: 'read only',
      database: query.database,
      setActor: async (_transaction, actor) => {
        assert.deepEqual(actor, { accountId: 'account', profileId: 'profile' });
      },
    });

    assert.deepEqual(queryResult, { data: { value: 'query' } });
    assert.deepEqual(query.state.accessModes, ['read only']);
    assert.equal(query.state.commits, 1);
    assert.equal(query.state.rollbacks, 0);

    const mutation = createTransactionDatabase();
    const mutationResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () => ({ data: { value: 'mutation' } }),
      accessMode: 'read write',
      database: mutation.database,
      setActor: async () => undefined,
    });

    assert.deepEqual(mutationResult, { data: { value: 'mutation' } });
    assert.deepEqual(mutation.state.accessModes, ['read write']);
    assert.equal(mutation.state.commits, 1);
  });

  it('commits GraphQL field errors but rolls back execute throws', async () => {
    const fieldError = createTransactionDatabase();
    await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () => ({ data: null, errors: [new GraphQLError('field failed')] }),
      accessMode: 'read write',
      database: fieldError.database,
      setActor: async () => undefined,
    });
    assert.equal(fieldError.state.commits, 1);
    assert.equal(fieldError.state.rollbacks, 0);

    const thrown = createTransactionDatabase();
    const cause = new Error('execute failed');
    await assert.rejects(
      executeInOperationTransaction({
        args: createArgs(createContext()),
        executeFn: async () => {
          throw cause;
        },
        accessMode: 'read write',
        database: thrown.database,
        setActor: async () => undefined,
      }),
      cause,
    );
    assert.equal(thrown.state.commits, 0);
    assert.equal(thrown.state.rollbacks, 1);
  });

  it('holds the transaction until an AsyncIterable reaches done', async () => {
    const { database, state } = createTransactionDatabase();
    const result = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () =>
        (async function* () {
          yield { data: { value: 'first' } };
          yield { data: { value: 'second' } };
        })(),
      accessMode: 'read only',
      database,
      setActor: async () => undefined,
    });

    assert.equal(state.commits, 0);
    assert.ok(Symbol.asyncIterator in result);
    const stream = result as AsyncIterable<ExecutionResult>;
    const iterator = stream[Symbol.asyncIterator]();
    assert.deepEqual(await iterator.next(), { done: false, value: { data: { value: 'first' } } });
    assert.equal(state.commits, 0);
    assert.deepEqual(await iterator.next(), { done: false, value: { data: { value: 'second' } } });
    assert.equal(state.commits, 0);
    assert.deepEqual(await iterator.next(), { done: true, value: undefined });
    assert.equal(state.commits, 1);
    assert.equal(state.rollbacks, 0);
  });

  it('propagates a commit failure after a stream reaches done', async () => {
    const commitError = new Error('commit failed');
    const { database, state } = createTransactionDatabase({ commitError });
    const result = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () =>
        (async function* () {
          yield { data: { value: 'value' } };
        })(),
      accessMode: 'read only',
      database,
      setActor: async () => undefined,
    });
    const iterator = (result as AsyncIterable<ExecutionResult>)[Symbol.asyncIterator]();
    assert.deepEqual(await iterator.next(), { done: false, value: { data: { value: 'value' } } });
    await assert.rejects(withTimeout(iterator.next()), commitError);
    assert.equal(state.commits, 0);
    assert.equal(state.rollbacks, 1);
  });

  it('rolls back and closes the source on iterable errors and consumer cancellation', async () => {
    const sourceError = new Error('source failed');
    const sourceDatabase = createTransactionDatabase();
    const errorSource = {
      async next() {
        throw sourceError;
      },
      async return() {
        return { done: true, value: undefined } as const;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<ExecutionResult>;
    const sourceResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () => errorSource,
      accessMode: 'read write',
      database: sourceDatabase.database,
      setActor: async () => undefined,
    });
    await assert.rejects(
      (sourceResult as AsyncIterable<ExecutionResult>)[Symbol.asyncIterator]().next(),
      sourceError,
    );
    assert.equal(sourceDatabase.state.rollbacks, 1);

    const returnDatabase = createTransactionDatabase();
    const returnResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () =>
        (async function* () {
          yield { data: { value: 'value' } };
          await new Promise(() => undefined);
        })(),
      accessMode: 'read write',
      database: returnDatabase.database,
      setActor: async () => undefined,
    });
    const returnIterator = (returnResult as AsyncIterable<ExecutionResult>)[Symbol.asyncIterator]();
    await returnIterator.next();
    await returnIterator.return?.();
    assert.equal(returnDatabase.state.commits, 0);
    assert.equal(returnDatabase.state.rollbacks, 1);

    const throwDatabase = createTransactionDatabase();
    const throwResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () =>
        (async function* () {
          yield { data: { value: 'value' } };
          await new Promise(() => undefined);
        })(),
      accessMode: 'read write',
      database: throwDatabase.database,
      setActor: async () => undefined,
    });
    const throwIterator = (throwResult as AsyncIterable<ExecutionResult>)[Symbol.asyncIterator]();
    await throwIterator.next();
    const consumerError = new Error('consumer stopped');
    assert.ok(throwIterator.throw);
    await assert.rejects(throwIterator.throw(consumerError), consumerError);
    assert.equal(throwDatabase.state.commits, 0);
    assert.equal(throwDatabase.state.rollbacks, 1);
  });

  it('rolls back an open stream when the request aborts', async () => {
    const controller = new AbortController();
    const { database, state } = createTransactionDatabase();
    const result = await executeInOperationTransaction({
      args: createArgs(createContext(controller.signal)),
      executeFn: async () =>
        (async function* () {
          yield { data: { value: 'value' } };
          await new Promise(() => undefined);
        })(),
      accessMode: 'read write',
      database,
      setActor: async () => undefined,
    });

    const iterator = (result as AsyncIterable<ExecutionResult>)[Symbol.asyncIterator]();
    await iterator.next();
    controller.abort();
    for (let attempts = 0; attempts < 20 && state.rollbacks === 0; attempts += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(state.commits, 0);
    assert.equal(state.rollbacks, 1);
    await assert.rejects(iterator.next(), { name: 'AbortError' });
  });

  it('aborts an unresolved execute function without pinning the transaction', async () => {
    const controller = new AbortController();
    const executeStarted = Promise.withResolvers<void>();
    const unresolvedExecute = Promise.withResolvers<ExecutionResult>();
    const { database, state } = createTransactionDatabase();
    const operation = executeInOperationTransaction({
      args: createArgs(createContext(controller.signal)),
      executeFn: () => {
        executeStarted.resolve();
        return unresolvedExecute.promise;
      },
      accessMode: 'read write',
      database,
      setActor: async () => undefined,
    });

    await executeStarted.promise;
    controller.abort();
    await assert.rejects(withTimeout(operation), { name: 'AbortError' });
    assert.equal(state.commits, 0);
    assert.equal(state.rollbacks, 1);

    // The late result must be consumed by the abort race rather than becoming
    // an unhandled rejection or changing the completed operation.
    unresolvedExecute.resolve({ data: { value: 'late' } });
  });

  it('closes a late AsyncIterable result when abort wins execute', async () => {
    const controller = new AbortController();
    const executeStarted = Promise.withResolvers<void>();
    const lateResult = Promise.withResolvers<AsyncIterable<ExecutionResult>>();
    const sourceClosed = Promise.withResolvers<void>();
    const source = {
      async return() {
        sourceClosed.resolve();
        return { done: true, value: undefined } as const;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<ExecutionResult>;
    const { database, state } = createTransactionDatabase();
    const operation = executeInOperationTransaction({
      args: createArgs(createContext(controller.signal)),
      executeFn: () => {
        executeStarted.resolve();
        return lateResult.promise;
      },
      accessMode: 'read write',
      database,
      setActor: async () => undefined,
    });

    await executeStarted.promise;
    controller.abort();
    await assert.rejects(withTimeout(operation), { name: 'AbortError' });
    assert.equal(state.rollbacks, 1);

    lateResult.resolve(source);
    await withTimeout(sourceClosed.promise);
  });

  it('rolls back when the source throw method throws synchronously', async () => {
    const { database, state } = createTransactionDatabase();
    const sourceError = new Error('source throw failed');
    const source = {
      async next() {
        return { done: false, value: { data: { value: 'value' } } };
      },
      throw() {
        throw sourceError;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<ExecutionResult>;
    const result = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () => source,
      accessMode: 'read write',
      database,
      setActor: async () => undefined,
    });
    const iterator = (result as AsyncIterable<ExecutionResult>)[Symbol.asyncIterator]();
    await iterator.next();
    assert.ok(iterator.throw);
    await assert.rejects(withTimeout(iterator.throw(new Error('consumer stopped'))), sourceError);
    assert.equal(state.commits, 0);
    assert.equal(state.rollbacks, 1);
  });

  it('serializes concurrent next calls and rejects a pending next after abort rollback', async () => {
    const serialDatabase = createTransactionDatabase();
    let active = 0;
    let maximumActive = 0;
    let calls = 0;
    const serialSource = {
      async next() {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        calls += 1;
        return calls === 1
          ? { done: false, value: { data: { value: 'value' } } }
          : { done: true, value: undefined };
      },
      async return() {
        return { done: true, value: undefined } as const;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<ExecutionResult>;
    const serialResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () => serialSource,
      accessMode: 'read only',
      database: serialDatabase.database,
      setActor: async () => undefined,
    });
    const serialIterator = (serialResult as AsyncIterable<ExecutionResult>)[Symbol.asyncIterator]();
    await Promise.all([serialIterator.next(), serialIterator.next()]);
    assert.equal(maximumActive, 1);
    assert.equal(serialDatabase.state.commits, 1);

    const controller = new AbortController();
    const abortDatabase = createTransactionDatabase();
    let resolvePending: ((result: IteratorResult<ExecutionResult>) => void) | undefined;
    let returnCalls = 0;
    const pendingSource = {
      next: () =>
        new Promise<IteratorResult<ExecutionResult>>((resolve) => {
          resolvePending = resolve;
        }),
      return: async () => {
        returnCalls += 1;
        return { done: true, value: undefined } as const;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<ExecutionResult>;
    const pendingResult = await executeInOperationTransaction({
      args: createArgs(createContext(controller.signal)),
      executeFn: async () => pendingSource,
      accessMode: 'read write',
      database: abortDatabase.database,
      setActor: async () => undefined,
    });
    const pendingIterator = (pendingResult as AsyncIterable<ExecutionResult>)[
      Symbol.asyncIterator
    ]();
    const pendingNext = pendingIterator.next();
    const secondPendingNext = pendingIterator.next();
    controller.abort();
    for (let attempts = 0; attempts < 20 && abortDatabase.state.rollbacks === 0; attempts += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(abortDatabase.state.rollbacks, 1);
    assert.equal(returnCalls, 1);
    await assert.rejects(withTimeout(pendingNext), { name: 'AbortError' });
    await assert.rejects(withTimeout(secondPendingNext), { name: 'AbortError' });
    resolvePending?.({ done: false, value: { data: { value: 'late' } } });

    const hangingReturnDatabase = createTransactionDatabase();
    let hangingReturnCalls = 0;
    const hangingReturnCleanup = Promise.withResolvers<IteratorResult<ExecutionResult>>();
    const hangingReturnSource = {
      async next() {
        return { done: false, value: { data: { value: 'value' } } };
      },
      return: () => {
        hangingReturnCalls += 1;
        return hangingReturnCleanup.promise;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<ExecutionResult>;
    const hangingReturnResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () => hangingReturnSource,
      accessMode: 'read write',
      database: hangingReturnDatabase.database,
      setActor: async () => undefined,
    });
    const hangingReturnIterator = (hangingReturnResult as AsyncIterable<ExecutionResult>)[
      Symbol.asyncIterator
    ]();
    await hangingReturnIterator.next();
    const hangingReturn = hangingReturnIterator.return?.();
    for (
      let attempts = 0;
      attempts < 20 && hangingReturnDatabase.state.rollbacks === 0;
      attempts += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(hangingReturnCalls, 1);
    assert.equal(hangingReturnDatabase.state.rollbacks, 1);
    hangingReturnCleanup.resolve({ done: false, value: { data: { value: 'late' } } });
    assert.deepEqual(await withTimeout(hangingReturn!), { done: true, value: undefined });

    const hangingThrowDatabase = createTransactionDatabase();
    const hangingThrowCleanup = Promise.withResolvers<IteratorResult<ExecutionResult>>();
    let hangingThrowReturnCalls = 0;
    const hangingThrowSource = {
      async next() {
        return { done: false, value: { data: { value: 'value' } } };
      },
      throw: () => hangingThrowCleanup.promise,
      async return() {
        hangingThrowReturnCalls += 1;
        return { done: true, value: undefined } as const;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<ExecutionResult>;
    const hangingThrowResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () => hangingThrowSource,
      accessMode: 'read write',
      database: hangingThrowDatabase.database,
      setActor: async () => undefined,
    });
    const hangingThrowIterator = (hangingThrowResult as AsyncIterable<ExecutionResult>)[
      Symbol.asyncIterator
    ]();
    await hangingThrowIterator.next();
    assert.ok(hangingThrowIterator.throw);
    const hangingThrow = hangingThrowIterator.throw(new Error('consumer stopped'));
    for (
      let attempts = 0;
      attempts < 20 && hangingThrowDatabase.state.rollbacks === 0;
      attempts += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(hangingThrowDatabase.state.rollbacks, 1);
    const hangingThrowError = new Error('source throw failed');
    hangingThrowCleanup.reject(hangingThrowError);
    await assert.rejects(withTimeout(hangingThrow), hangingThrowError);
    assert.equal(hangingThrowReturnCalls, 1);

    const normalizedThrowDatabase = createTransactionDatabase();
    let normalizedThrowReturnCalls = 0;
    const normalizedThrowSource = {
      async next() {
        return { done: false, value: { data: { value: 'value' } } };
      },
      async throw() {
        return { done: false, value: { data: { value: 'late' } } } as const;
      },
      async return() {
        normalizedThrowReturnCalls += 1;
        return { done: false, value: { data: { value: 'late' } } } as const;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as unknown as AsyncIterableIterator<ExecutionResult>;
    const normalizedThrowResult = await executeInOperationTransaction({
      args: createArgs(createContext()),
      executeFn: async () => normalizedThrowSource,
      accessMode: 'read write',
      database: normalizedThrowDatabase.database,
      setActor: async () => undefined,
    });
    const normalizedThrowIterator = (normalizedThrowResult as AsyncIterable<ExecutionResult>)[
      Symbol.asyncIterator
    ]();
    await normalizedThrowIterator.next();
    const originalConsumerError = new Error('consumer stopped');
    assert.ok(normalizedThrowIterator.throw);
    await assert.rejects(
      withTimeout(normalizedThrowIterator.throw(originalConsumerError)),
      originalConsumerError,
    );
    assert.equal(normalizedThrowReturnCalls, 1);
    assert.equal(normalizedThrowDatabase.state.rollbacks, 1);
  });
});

describe('GraphQL operation context isolation', () => {
  it('matches Yoga cancellation classification for abort and timeout DOMExceptions', () => {
    assert.equal(isCancellationError(new DOMException('aborted', 'AbortError')), true);
    assert.equal(isCancellationError(new DOMException('timed out', 'TimeoutError')), true);
    assert.equal(
      isCancellationError(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
      false,
    );
  });

  it('copies the session and gives each operation a distinct loader registry', async () => {
    const requestContext = await deriveContext({
      req: { header: () => undefined },
    } as unknown as ServerContext);
    requestContext.session = { id: 'session', accountId: 'account', profileId: 'profile' };
    const first = createOperationContext(requestContext);
    const second = createOperationContext(requestContext);

    assert.notEqual(first.$loaders, second.$loaders);
    assert.notEqual(first.loader, second.loader);
    assert.notEqual(first.session, second.session);
    assert.deepEqual(first.session, second.session);

    const firstLoader = first.loader({
      name: 'test',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });
    const secondLoader = second.loader({
      name: 'test',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });

    assert.notEqual(firstLoader, secondLoader);
    assert.equal(first.$loaders.size, 1);
    assert.equal(second.$loaders.size, 1);
  });

  it('does not install an execute transaction for subscription operations', async () => {
    const plugin = useOperationContext();
    let replacement: ((args: ExecutionArgs) => unknown) | undefined;
    await plugin.onExecute?.({
      args: {
        schema: {} as never,
        document: parse('subscription Events { value }'),
        contextValue: createContext(),
      },
      executeFn: async () => ({ data: {} }),
      setExecuteFn: (next: (args: ExecutionArgs) => unknown) => {
        replacement = next as typeof replacement;
      },
    } as never);

    assert.equal(replacement, undefined);
  });
});
