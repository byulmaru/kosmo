import { db } from '@kosmo/core/db';
import type { DatabaseHandle, Transaction } from '@kosmo/core/db';

export type FedifyExecutionContext = {
  readonly db: DatabaseHandle;
};

type FedifyActionContext = {
  readonly db: Transaction;
};

export const createFedifyExecutionContext = (
  handle: DatabaseHandle = db,
): FedifyExecutionContext => ({ db: handle });

export const withFedifyAction = async <T>(
  context: FedifyExecutionContext,
  action: (context: FedifyActionContext) => T | Promise<T>,
): Promise<T> => context.db.transaction((tx) => Promise.resolve(action({ db: tx })));
