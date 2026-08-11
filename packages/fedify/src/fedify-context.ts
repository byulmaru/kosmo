import type { Database } from '@kosmo/core/db';

export type FedifyContextData = { readonly db: Database };

export const createFedifyContextData = (database: Database): FedifyContextData => ({
  db: database,
});
