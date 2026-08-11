import { db } from '@kosmo/core/db';
import type { Database } from '@kosmo/core/db';

export type FedifyContextData = { readonly db: Database } | undefined;

export const createFedifyContextData = (
  database: Database = db,
): NonNullable<FedifyContextData> => ({ db: database });

export const getFedifyDatabase = (data: FedifyContextData): Database => data?.db ?? db;
