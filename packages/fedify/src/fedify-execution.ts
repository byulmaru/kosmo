import { db } from '@kosmo/core/db';
import type { DatabaseHandle } from '@kosmo/core/db';

export type FedifyExecutionContext = {
  readonly db: DatabaseHandle;
};

export const createFedifyExecutionContext = (
  handle: DatabaseHandle = db,
): FedifyExecutionContext => ({ db: handle });
