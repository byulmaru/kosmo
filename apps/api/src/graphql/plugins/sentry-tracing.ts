import * as Sentry from '@sentry/node';
import { getOperationAST } from 'graphql';
import type { Plugin } from 'graphql-yoga';

export const useSentryTracing = (): Plugin => ({
  onExecute({ args, executeFn, setExecuteFn }) {
    const operation = getOperationAST(args.document, args.operationName);

    if (!operation || operation.operation === 'subscription') {
      return;
    }

    setExecuteFn((executionArgs) =>
      Sentry.startSpan(
        {
          name: `${operation.operation} ${operation.name?.value ?? '<anonymous>'}`,
          op: 'graphql.execute',
        },
        () => executeFn(executionArgs),
      ),
    );
  },
});
