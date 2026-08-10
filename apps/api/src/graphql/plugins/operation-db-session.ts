import { createOperationDatabase } from '@kosmo/core/db';
import { sql } from 'drizzle-orm';
import { getOperationAST } from 'graphql';
import type { OperationDatabaseOwner } from '@kosmo/core/db';
import type { DocumentNode } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

type CreateOperationDatabase = () => OperationDatabaseOwner;

export type OperationDatabaseSessionOptions = {
  createDatabase?: CreateOperationDatabase;
};

const setActorSession = async (context: UserContext, database: OperationDatabaseOwner['db']) => {
  const accountId = context.session?.accountId ?? '';
  const profileId = context.session?.profileId ?? '';

  await database.execute(sql`
    select
      set_config('kosmo.account_id', ${accountId}, false),
      set_config('kosmo.profile_id', ${profileId}, false)
  `);
};

const getOperationType = (document: DocumentNode, operationName?: string) =>
  getOperationAST(document, operationName)?.operation;

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

    return (async () => {
      try {
        await setActorSession(context, owner.db);
        extendContext({ db: owner.db });
      } catch (error) {
        await owner.close();
        throw error;
      }

      setExecuteFn(async (executeArgs) => {
        try {
          return await executeFn({ ...executeArgs, contextValue: context });
        } finally {
          await owner.close();
        }
      });
    })();
  },
});
