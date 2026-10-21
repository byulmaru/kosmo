import { withPrimaryDatabase } from '@kosmo/core/db';
import { getOperationAST } from 'graphql';
import type { Plugin } from 'graphql-yoga';

export const useMutationPrimaryDatabase = (): Plugin => ({
  onExecute({ args, executeFn, setExecuteFn }) {
    if (getOperationAST(args.document, args.operationName)?.operation === 'mutation') {
      setExecuteFn((executionArgs) => withPrimaryDatabase(() => executeFn(executionArgs)));
    }
  },
});
