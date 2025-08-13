import { logger } from '@kosmo/logger';
import type { Plugin } from 'graphql-yoga';
import type { Context } from '@/context';

const log = logger.getChild('graphql');

export const useLogger = (): Plugin<Context> => ({
  onExecute: ({ args }) => {
    log.info('Executed operation {*}', {
      ip: args.contextValue.ip,
      user: args.contextValue.session?.accountId,
      operationName: args.operationName,
    });
  },
});
