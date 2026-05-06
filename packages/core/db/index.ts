import { drizzle } from 'drizzle-orm/postgres-js';
import * as enums from './enums';
import { relations } from './relations';
import * as tables from './tables';

export * from './id';
export * from './relations';
export * from './tables';
export * from './utils';
export { and, eq } from 'drizzle-orm';

export const db = drizzle(process.env.DATABASE_URL!, {
  relations,
  schema: { ...tables, ...enums },
});

export type Database = typeof db;
