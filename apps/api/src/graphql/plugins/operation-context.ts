import { db } from '@kosmo/core/db';
import { sql } from 'drizzle-orm';
import { getOperationAST } from 'graphql';
import { isAsyncIterable } from 'graphql-yoga';
import { createExecutionErrorResult } from './error';
import type { Database, Transaction } from '@kosmo/core/db';
import type { ExecutionArgs, ExecutionResult } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

export type OperationAccessMode = 'read only' | 'read write';

export type OperationActor = {
  accountId: string;
  profileId: string;
};

export type OperationDatabase = Pick<Database, 'transaction'>;

type ExecuteFunction = (
  args: ExecutionArgs,
) =>
  | ExecutionResult
  | AsyncIterable<ExecutionResult>
  | Promise<ExecutionResult | AsyncIterable<ExecutionResult>>;

type Deferred<T> = PromiseWithResolvers<T>;

type OperationResult = ExecutionResult | AsyncIterable<ExecutionResult>;

const createDeferred = <T>(): Deferred<T> => Promise.withResolvers<T>();

const getAbortReason = (signal: AbortSignal): unknown => {
  if (signal.reason !== undefined) {
    return signal.reason;
  }
  const error = new Error('GraphQL operation aborted');
  error.name = 'AbortError';
  return error;
};

const getRequestSignal = (context: unknown): AbortSignal | undefined => {
  const value = context as (Partial<UserContext> & { request?: Request }) | undefined;
  return value?.c?.req?.raw?.signal ?? value?.request?.signal;
};

/**
 * Set the actor snapshot before any resolver SQL runs. `true` makes both
 * settings transaction-local, so an idle pooled connection cannot retain the
 * previous operation's identity.
 */
export const setOperationActor = async (
  transaction: Transaction,
  actor: OperationActor,
): Promise<void> => {
  await transaction.execute(sql`
    select
      set_config('kosmo.account_id', ${actor.accountId}, true),
      set_config('kosmo.profile_id', ${actor.profileId}, true)
  `);
};

type AsyncOperationIterator = AsyncIterator<ExecutionResult> &
  AsyncIterableIterator<ExecutionResult>;

type StreamBridgeOptions = {
  source: AsyncIterable<ExecutionResult>;
  completion: Deferred<void>;
  finished: Deferred<void>;
  signal?: AbortSignal;
};

const createStreamBridge = ({
  source,
  completion,
  finished,
  signal,
}: StreamBridgeOptions): AsyncIterableIterator<ExecutionResult> => {
  const iterator = source[Symbol.asyncIterator]();
  let closed = false;
  let sourceClosed = false;
  let hasTerminalError = false;
  let terminalError: unknown;
  let cleaned = false;
  let normalCompletion = false;
  let normalCompletionFailed = false;
  let normalCompletionError: unknown;
  const termination = createDeferred<IteratorResult<ExecutionResult>>();
  // A pending `next()` races this promise so request cancellation can reject
  // it without waiting for a source that never resolves.
  void termination.promise.catch(() => undefined);

  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    signal?.removeEventListener('abort', onAbort);
  };

  const waitForRollback = async () => {
    await finished.promise.catch(() => undefined);
  };

  const closeSource = async (value?: unknown): Promise<IteratorResult<ExecutionResult>> => {
    if (sourceClosed) {
      return { done: true, value: value as never };
    }
    sourceClosed = true;
    if (typeof iterator.return === 'function') {
      return (await iterator.return(value)) as IteratorResult<ExecutionResult>;
    }
    return { done: true, value: value as never };
  };

  const setTerminalError = (error: unknown) => {
    hasTerminalError = true;
    terminalError = error;
    termination.reject(error);
  };

  const rollback = async (reason: unknown) => {
    completion.reject(reason);
    await waitForRollback();
    cleanup();
  };

  const abort = async (reason: unknown) => {
    if (closed) {
      return;
    }
    closed = true;
    setTerminalError(reason);
    const sourceClose = closeSource().catch(() => undefined);
    await rollback(reason);
    // Do not hold transaction rollback behind a non-cooperative iterator. The
    // source cleanup was started above and is deliberately best effort.
    void sourceClose;
  };

  const onAbort = () => {
    void abort(signal ? getAbortReason(signal) : new Error('GraphQL operation aborted')).catch(
      () => undefined,
    );
  };

  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) {
    onAbort();
  }

  let nextTail: Promise<unknown> = Promise.resolve();
  const nextImpl = async (value?: unknown) => {
    if (closed) {
      if (hasTerminalError) {
        await waitForRollback();
        throw terminalError;
      }
      await waitForRollback();
      if (normalCompletionFailed) {
        throw normalCompletionError;
      }
      return { done: true, value: undefined as never };
    }

    try {
      const sourceNext = Promise.resolve().then(() => iterator.next(value));
      const result = await Promise.race([sourceNext, termination.promise]);
      if (closed) {
        if (hasTerminalError) {
          await waitForRollback();
          throw terminalError;
        }
        await waitForRollback();
        return result;
      }
      if (!result.done) {
        return result;
      }

      closed = true;
      sourceClosed = true;
      normalCompletion = true;
      termination.resolve(result);
      completion.resolve();
      try {
        await finished.promise;
        return result;
      } finally {
        cleanup();
      }
    } catch (error) {
      if (closed && hasTerminalError) {
        await waitForRollback();
        throw terminalError;
      }
      if (normalCompletion) {
        normalCompletionFailed = true;
        normalCompletionError = error;
        throw error;
      }
      if (closed) {
        await waitForRollback();
        return { done: true, value: undefined as never };
      }
      closed = true;
      setTerminalError(error);
      const sourceCleanup = closeSource().catch(() => undefined);
      await rollback(error);
      // Source cleanup is best effort and must not hold the transaction open.
      void sourceCleanup;
      throw error;
    }
  };

  const next = (value?: unknown) => {
    if (closed) {
      return nextImpl(value);
    }
    const result = nextTail.then(() => nextImpl(value));
    nextTail = result.catch(() => undefined);
    return result;
  };

  const bridge: AsyncOperationIterator = {
    next,

    async return(value) {
      if (closed) {
        if (hasTerminalError) {
          throw terminalError;
        }
        return { done: true, value: value as never };
      }

      closed = true;
      termination.resolve({ done: true, value: value as never });
      const sourceCleanup = closeSource(value).then(
        (result) => ({ result }),
        (error) => ({ error }),
      );
      const reason = new Error('GraphQL operation stream cancelled');
      await rollback(reason);
      const cleanupResult = await sourceCleanup;
      if (cleanupResult && 'error' in cleanupResult) {
        hasTerminalError = true;
        terminalError = cleanupResult.error;
        throw cleanupResult.error;
      }
      return { done: true, value: value as never };
    },

    async throw(error) {
      if (closed) {
        throw error;
      }

      closed = true;
      const reason = error ?? new Error('GraphQL operation stream cancelled');
      setTerminalError(reason);
      const sourceThrow =
        typeof iterator.throw === 'function'
          ? Promise.resolve()
              .then(() => iterator.throw!(error))
              .then(
                (result) => ({ result: result as IteratorResult<ExecutionResult> }),
                (cause) => ({ error: cause }),
              )
          : undefined;
      await rollback(reason);
      if (typeof iterator.throw !== 'function') {
        const sourceCleanup = await closeSource().then(
          (result) => ({ result }),
          (cause) => ({ error: cause }),
        );
        if ('error' in sourceCleanup) {
          terminalError = sourceCleanup.error;
          throw sourceCleanup.error;
        }
        throw reason;
      }

      const throwResult = await sourceThrow!;
      const sourceCleanup = await closeSource().then(
        (result) => ({ result }),
        (cause) => ({ error: cause }),
      );
      if ('error' in throwResult) {
        terminalError = throwResult.error;
        throw throwResult.error;
      }
      if ('error' in sourceCleanup) {
        terminalError = sourceCleanup.error;
        throw sourceCleanup.error;
      }
      throw reason;
    },

    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return bridge;
};

export type ExecuteInOperationTransactionOptions = {
  args: ExecutionArgs;
  executeFn: ExecuteFunction;
  accessMode: OperationAccessMode;
  database: OperationDatabase;
  setActor: (transaction: Transaction, actor: OperationActor) => Promise<void>;
};

/**
 * Execute one Query or Mutation in a primary transaction. A stream is exposed
 * as soon as the execute function produces it, while the Drizzle callback waits
 * on the bridge's completion signal so commit/rollback follows consumption.
 */
export const executeInOperationTransaction = async ({
  args,
  executeFn,
  accessMode,
  database,
  setActor,
}: ExecuteInOperationTransactionOptions): Promise<OperationResult> => {
  const ready = createDeferred<OperationResult>();
  const finished = createDeferred<void>();
  const signal = getRequestSignal(args.contextValue);
  const actor: OperationActor = {
    accountId: (args.contextValue as Partial<UserContext> | undefined)?.session?.accountId ?? '',
    profileId: (args.contextValue as Partial<UserContext> | undefined)?.session?.profileId ?? '',
  };
  let streamStarted = false;
  let transactionTask: Promise<unknown>;

  try {
    transactionTask = database.transaction(
      async (transaction) => {
        const abortSignal = signal ? createDeferred<never>() : undefined;
        let abortWon = false;
        const onAbort = () => {
          abortWon = true;
          abortSignal?.reject(getAbortReason(signal!));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        void abortSignal?.promise.catch(() => undefined);

        const runPromiseWithAbort = <T>(operationPromise: Promise<T>): Promise<T> => {
          return abortSignal
            ? Promise.race([operationPromise, abortSignal.promise])
            : operationPromise;
        };
        const runWithAbort = <T>(operation: () => T | PromiseLike<T>): Promise<T> =>
          runPromiseWithAbort(Promise.resolve().then(operation));

        const closeLateResult = (result: unknown) => {
          if (!isAsyncIterable(result)) {
            return;
          }
          try {
            const iterator = result[Symbol.asyncIterator]();
            if (typeof iterator.return === 'function') {
              void Promise.resolve()
                .then(() => iterator.return!())
                .catch(() => undefined);
            }
          } catch {
            // A late result is already outside the operation lifecycle; cleanup
            // is best effort and must not create an unhandled rejection.
          }
        };

        try {
          if (signal?.aborted) {
            throw getAbortReason(signal);
          }
          await runWithAbort(() => setActor(transaction, actor));

          const contextValue = {
            ...(args.contextValue as UserContext),
            db: transaction,
          } as UserContext;
          const executePromise = Promise.resolve().then(() => executeFn({ ...args, contextValue }));
          let result: Awaited<ReturnType<ExecuteFunction>>;
          try {
            result = await runPromiseWithAbort(executePromise);
          } catch (error) {
            if (abortWon) {
              void executePromise.then(closeLateResult, () => undefined);
            }
            throw error;
          }
          if (signal?.aborted) {
            closeLateResult(result);
            throw getAbortReason(signal);
          }

          if (!isAsyncIterable(result)) {
            ready.resolve(result);
            return result;
          }

          const completion = createDeferred<void>();
          const bridge = createStreamBridge({
            source: result,
            completion,
            finished,
            signal,
          });
          streamStarted = true;
          signal?.removeEventListener('abort', onAbort);
          ready.resolve(bridge);
          await completion.promise;
          return bridge;
        } catch (error) {
          ready.reject(error);
          throw error;
        } finally {
          if (!streamStarted) {
            signal?.removeEventListener('abort', onAbort);
          }
        }
      },
      { accessMode },
    );
  } catch (error) {
    finished.reject(error);
    ready.reject(error);
    throw error;
  }

  transactionTask.then(
    () => finished.resolve(),
    (error) => {
      finished.reject(error);
      ready.reject(error);
    },
  );
  // A stream consumer observes transaction failures through its iterator; this
  // handler prevents an unhandled rejection if the request is abandoned.
  void finished.promise.catch(() => undefined);

  const result = await ready.promise;
  if (!isAsyncIterable(result)) {
    await finished.promise;
  }
  return result;
};

export const isCancellationError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const value = error as { constructor?: { name?: unknown }; name?: unknown };
  return (
    value.constructor?.name === 'DOMException' &&
    (value.name === 'AbortError' || value.name === 'TimeoutError')
  );
};

/**
 * Wrap only executable Query/Mutation operations. Subscription setup follows
 * Envelop's `onSubscribe` path and intentionally does not receive a primary
 * transaction, preventing a long-lived stream from pinning a connection.
 */
export const useOperationContext = (): Plugin<UserContext> => ({
  onExecute({ args, executeFn, setExecuteFn }) {
    const operation = getOperationAST(args.document, args.operationName)?.operation;
    if (operation !== 'query' && operation !== 'mutation') {
      return;
    }

    setExecuteFn((executionArgs) =>
      executeInOperationTransaction({
        args: executionArgs,
        executeFn,
        accessMode: operation === 'query' ? 'read only' : 'read write',
        database: db,
        setActor: setOperationActor,
      }).catch((error) => {
        if (isCancellationError(error)) {
          throw error;
        }
        return createExecutionErrorResult(error);
      }),
    );
  },
});
