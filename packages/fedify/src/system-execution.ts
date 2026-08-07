import { db } from '@kosmo/core/db';
import type { DatabaseHandle, Transaction } from '@kosmo/core/db';

export type SystemExecutionContext = {
  readonly db: DatabaseHandle;
};

type SystemActionContext = {
  readonly db: Transaction;
};

export const createSystemExecutionContext = (
  handle: DatabaseHandle = db,
): SystemExecutionContext => ({ db: handle });

export const withSystemAction = async <T>(
  context: SystemExecutionContext,
  action: (context: SystemActionContext) => T | Promise<T>,
): Promise<T> => context.db.transaction((tx) => Promise.resolve(action({ db: tx })));
