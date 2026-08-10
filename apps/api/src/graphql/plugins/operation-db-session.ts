import { createOperationDatabase, postgresSessionTimeouts } from '@kosmo/core/db';
import { sql } from 'drizzle-orm';
import { getOperationAST } from 'graphql';
import type { OperationDatabaseOwner } from '@kosmo/core/db';
import type { DocumentNode } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

type CreateOperationDatabase = () => OperationDatabaseOwner;
type CloseOptions = { force?: boolean };

export type OperationDatabaseSessionOptions = {
  createDatabase?: CreateOperationDatabase;
};

const setActorSession = async (context: UserContext, database: OperationDatabaseOwner['db']) => {
  const accountId = context.session?.accountId ?? '';
  const profileId = context.session?.profileId ?? '';

  await database.execute(sql`
    select
      set_config('kosmo.account_id', ${accountId}, false),
      set_config('kosmo.profile_id', ${profileId}, false),
      set_config(
        'idle_in_transaction_session_timeout',
        ${String(postgresSessionTimeouts.idle_in_transaction_session_timeout)},
        false
      ),
      set_config('lock_timeout', ${String(postgresSessionTimeouts.lock_timeout)}, false),
      set_config('statement_timeout', ${String(postgresSessionTimeouts.statement_timeout)}, false)
  `);
};

const getOperationType = (document: DocumentNode, operationName?: string) =>
  getOperationAST(document, operationName)?.operation;

const getAbortReason = (signal: AbortSignal) =>
  signal.reason ?? new Error('GraphQL operation was aborted.');

const waitForActorSession = async (
  initialization: Promise<unknown>,
  signal: AbortSignal | undefined,
  close: (options?: CloseOptions) => Promise<void>,
) => {
  if (!signal) {
    await initialization;
    return;
  }

  const { promise: aborted, reject } = Promise.withResolvers<never>();
  const onAbort = () => {
    void close({ force: true }).catch(() => undefined);
    reject(getAbortReason(signal));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) {
    onAbort();
  }

  try {
    await Promise.race([initialization, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/**
 * Own one closeable PostgreSQL client for each regular Query or Mutation.
 *
 * Envelop's execute replacement is intentional: onExecuteDone is not invoked
 * when execute throws, while this wrapper can await cleanup in every path.
 */
export const useOperationDatabaseSession = ({
  createDatabase = createOperationDatabase,
}: OperationDatabaseSessionOptions = {}): Plugin<UserContext> => ({
  onExecute({ args, context, executeFn, extendContext, setExecuteFn }) {
    const operationType = getOperationType(args.document, args.operationName);

    if (!operationType || operationType === 'subscription') {
      return;
    }

    const owner = createDatabase();
    let closePromise: Promise<void> | undefined;
    const close = (options?: CloseOptions) => (closePromise ??= owner.close(options));
    const signal = (args as typeof args & { signal?: AbortSignal }).signal;

    return (async () => {
      try {
        await waitForActorSession(setActorSession(context, owner.db), signal, close);
        if (signal?.aborted) {
          throw getAbortReason(signal);
        }
        extendContext({ db: owner.db });
      } catch (error) {
        try {
          await close(signal?.aborted ? { force: true } : undefined);
        } catch {
          // Preserve the initialization or abort error as the operation result.
        }
        throw error;
      }

      setExecuteFn(async (executeArgs) => {
        try {
          return await executeFn({ ...executeArgs, contextValue: context });
        } finally {
          await close(signal?.aborted ? { force: true } : undefined);
        }
      });
    })();
  },
});
