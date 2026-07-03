import { pg } from '@kosmo/core/db';
import { seedDatabase } from '@kosmo/core/db/seed';

export async function resetE2EDatabase() {
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

  await seedDatabase();
}

export async function closeE2EDatabase() {
  await pg.end();
}
