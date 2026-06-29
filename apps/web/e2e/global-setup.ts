export default async function globalSetup() {
  process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
  process.env.PUBLIC_ORIGIN ??= 'http://127.0.0.1:4173';

  const { db, pg } = await import('@kosmo/core/db');
  const { bootstrapConfiguredLocalInstance } = await import('@kosmo/core/db/seed');

  await pg.unsafe(`
    DO $$
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement;
      END IF;
    END $$;
  `);

  await bootstrapConfiguredLocalInstance(db);

  await pg.end();
}
