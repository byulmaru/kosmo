import { closeE2EDatabase, resetE2EDatabase } from './db-fixtures';

export default async function globalSetup() {
  process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
  process.env.PUBLIC_ORIGIN ??= 'http://127.0.0.1:4173';

  await resetE2EDatabase();
  await closeE2EDatabase();
}
